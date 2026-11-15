import React, { useEffect, useRef, useState } from 'react';
import {
  Grid3X3,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../lib/firebase';
import {
  addCallIceCandidate,
  postMissedCallMessage,
  updateCallSignaling,
  updateCallState,
} from '../services/chatService';
import type { CallIceCandidate, CallRecord, UserPublic } from '../types/dank';
import { Avatar } from './Avatar';

interface CallModalProps {
  call: CallRecord;
  currentUser: UserPublic;
  onClose: () => void;
}

const KEYPAD_KEYS: Array<{ digit: string; letters: string }> = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

const DTMF_FREQS: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '*': [941, 1209],
  '0': [941, 1336],
  '#': [941, 1477],
};

function formatCallDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function playDtmfTone(digit: string): void {
  const pair = DTMF_FREQS[digit];
  if (!pair || typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.frequency.value = pair[0];
    osc2.frequency.value = pair[1];
    gain.gain.value = 0.06;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start();
    osc2.start();
    window.setTimeout(() => {
      osc1.stop();
      osc2.stop();
      void ctx.close().catch(() => {});
    }, 110);
  } catch {
    // Ignore WebAudio autoplay restrictions
  }
}

export const CallModal: React.FC<CallModalProps> = ({ call, currentUser, onClose }) => {
  const { t } = useLanguage();
  const isIncoming = call.calleeId === currentUser.uid;
  const peerName = isIncoming ? call.callerName : call.calleeName;
  const peerPhoto = isIncoming ? call.callerPhoto : call.calleePhoto;

  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [showKeypad, setShowKeypad] = useState(false);
  const [dialedDigits, setDialedDigits] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [ringPhase, setRingPhase] = useState<'calling' | 'ringing'>('calling');

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const answerCreatedRef = useRef(false);
  const remoteAnswerAppliedRef = useRef(false);
  const processedCandidateIdsRef = useRef<Set<string>>(new Set());
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const missedNotifiedRef = useRef(false);

  // Elapsed timer when connected
  useEffect(() => {
    if (call.status !== 'connected') {
      setElapsed(0);
      return;
    }
    const id = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [call.status]);

  // Subtle Calling... -> Ringing... progression for outgoing calls
  useEffect(() => {
    if (call.status !== 'ringing' || isIncoming) return;
    if (call.offerSdp) {
      setRingPhase('ringing');
      return;
    }
    const timer = window.setTimeout(() => setRingPhase('ringing'), 1400);
    return () => window.clearTimeout(timer);
  }, [call.status, call.offerSdp, isIncoming]);

  // Speaker toggle on hidden audio element
  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !speaker;
    }
  }, [speaker]);

  // Mute local audio tracks
  useEffect(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, [muted]);

  // 35s outgoing no-answer timeout -> mark missed & post missed call message in Chats
  useEffect(() => {
    if (isIncoming || call.status !== 'ringing') return;
    const timer = window.setTimeout(() => {
      if (!missedNotifiedRef.current) {
        missedNotifiedRef.current = true;
        void updateCallState(call.id, { status: 'missed', durationSeconds: 0 });
        void postMissedCallMessage(call, currentUser);
      }
    }, 35_000);
    return () => window.clearTimeout(timer);
  }, [isIncoming, call.id, call.status, currentUser]);

  // Helper to ensure peer connection + local mic (graceful fallback if mic unavailable)
  const ensurePeerConnection = async (): Promise<RTCPeerConnection | null> => {
    if (pcRef.current) return pcRef.current;
    if (typeof RTCPeerConnection === 'undefined') return null;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void addCallIceCandidate(
          call.id,
          currentUser.uid,
          JSON.stringify(event.candidate.toJSON())
        );
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (remoteAudioRef.current && stream) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.muted = !speaker;
        void remoteAudioRef.current.play().catch(() => {});
      }
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !muted;
          pc.addTrack(track, stream);
        });
      } catch {
        // Headless/mic-denied fallback: keep call UI & timer functional without audio hardware
      }
    }

    return pc;
  };

  // Outgoing caller WebRTC offer creation
  useEffect(() => {
    if (isIncoming || call.status === 'ended' || call.status === 'declined' || call.status === 'missed') {
      return;
    }
    let cancelled = false;

    const setupOutgoing = async () => {
      const pc = await ensurePeerConnection();
      if (!pc || cancelled || call.offerSdp) return;
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        if (cancelled) return;
        await pc.setLocalDescription(offer);
        await updateCallSignaling(call.id, { offerSdp: JSON.stringify(offer) });
      } catch {
        // Keep mock call flow active if WebRTC signaling fails
      }
    };

    void setupOutgoing();
    return () => {
      cancelled = true;
    };
  }, [call.id, isIncoming]);

  // Apply remote answer SDP on caller side
  useEffect(() => {
    if (isIncoming || !call.answerSdp || remoteAnswerAppliedRef.current) return;
    const pc = pcRef.current;
    if (!pc) return;

    const applyAnswer = async () => {
      try {
        const parsed = JSON.parse(call.answerSdp!) as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(new RTCSessionDescription(parsed));
        remoteAnswerAppliedRef.current = true;
        for (const cand of queuedCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        queuedCandidatesRef.current = [];
      } catch {
        // Ignore stale SDP
      }
    };

    void applyAnswer();
  }, [call.answerSdp, isIncoming]);

  // Listen to ICE candidates subcollection
  useEffect(() => {
    if (call.status === 'ended' || call.status === 'declined' || call.status === 'missed') {
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'calls', call.id, 'candidates'),
      (snap) => {
        snap.docs.forEach((d) => {
          const item = d.data() as CallIceCandidate;
          if (!item || item.senderId === currentUser.uid) return;
          if (processedCandidateIdsRef.current.has(item.id)) return;
          processedCandidateIdsRef.current.add(item.id);
          try {
            const parsed = JSON.parse(item.candidate) as RTCIceCandidateInit;
            const pc = pcRef.current;
            if (pc && pc.remoteDescription) {
              void pc.addIceCandidate(new RTCIceCandidate(parsed)).catch(() => {});
            } else {
              queuedCandidatesRef.current.push(parsed);
            }
          } catch {
            // Ignore malformed candidate JSON
          }
        });
      },
      () => {}
    );

    return () => unsub();
  }, [call.id, call.status, currentUser.uid]);

  // Cleanup WebRTC and local mic on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((tr) => tr.stop());
        localStreamRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, []);

  // Auto-close after ended/declined/missed
  useEffect(() => {
    if (call.status === 'ended' || call.status === 'declined' || call.status === 'missed') {
      const id = window.setTimeout(onClose, 1200);
      return () => window.clearTimeout(id);
    }
  }, [call.status, onClose]);

  const handleAccept = async () => {
    await updateCallState(call.id, { status: 'connected' });
    if (answerCreatedRef.current) return;
    answerCreatedRef.current = true;
    try {
      const pc = await ensurePeerConnection();
      if (pc && call.offerSdp) {
        const offer = JSON.parse(call.offerSdp) as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        for (const cand of queuedCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        queuedCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateCallSignaling(call.id, { answerSdp: JSON.stringify(answer) });
      }
    } catch {
      // Fallback: timer & UI stay active even without WebRTC audio
    }
  };

  const handleDecline = async () => {
    await updateCallState(call.id, { status: 'declined', durationSeconds: 0 });
    onClose();
  };

  const handleEnd = async () => {
    const isMissed = call.status === 'ringing' && !isIncoming;
    const nextStatus = isMissed ? 'missed' : 'ended';
    await updateCallState(call.id, { status: nextStatus, durationSeconds: elapsed });
    if (isMissed && !missedNotifiedRef.current) {
      missedNotifiedRef.current = true;
      await postMissedCallMessage(call, currentUser);
    }
    onClose();
  };

  const statusText =
    call.status === 'ringing'
      ? isIncoming
        ? t.calls.incomingVoice
        : ringPhase === 'calling'
        ? t.calls.calling
        : t.calls.ringing
      : call.status === 'connected'
      ? formatCallDuration(elapsed)
      : call.status === 'declined'
      ? t.calls.declined
      : call.status === 'missed'
      ? t.calls.missed
      : t.calls.ended;

  return (
    <div className="fixed inset-0 z-[70] h-[100dvh] w-full bg-[var(--dank-canvas)] text-[var(--dank-text)] flex flex-col items-center justify-between px-6 py-8 select-none overflow-hidden">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Subtle Ambient Glow */}
      <div
        className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl opacity-20"
        style={{ backgroundColor: 'var(--dank-accent)' }}
      />

      {/* Top Status Pill */}
      <div className="relative z-10 w-full max-w-sm flex items-center justify-between text-xs text-[var(--dank-muted)]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--dank-accent)]">
          <Phone className="w-4 h-4" />
          {t.calls.voiceCall}
        </span>
        <span className="font-extrabold tracking-wider text-[var(--dank-text)]">DANK</span>
      </div>

      {/* Center Contact Photo + Name + Status/Timer OR Interactive Keypad */}
      <div className="relative z-10 flex flex-col items-center text-center my-auto w-full max-w-xs">
        {!showKeypad ? (
          <>
            <div className="relative mb-6">
              {call.status === 'ringing' && (
                <>
                  <div
                    className="absolute -inset-6 rounded-full animate-ping opacity-20"
                    style={{ backgroundColor: 'var(--dank-accent)' }}
                  />
                  <div
                    className="absolute -inset-3 rounded-full animate-pulse opacity-30"
                    style={{ backgroundColor: 'var(--dank-accent)' }}
                  />
                </>
              )}
              <div className="relative rounded-full p-1 bg-[var(--dank-surface)] border-2 border-[var(--dank-accent-border)] shadow-2xl">
                <Avatar
                  src={peerPhoto}
                  name={peerName}
                  size="xl"
                  className="[&>img]:w-32 [&>img]:h-32 [&>div]:w-32 [&>div]:h-32 [&>div]:text-3xl"
                />
              </div>
            </div>

            <h2 dir="auto" className="text-2xl sm:text-3xl font-extrabold text-[var(--dank-text)]">
              {peerName}
            </h2>
            <p
              className={`mt-2 text-base font-semibold tabular-nums ${
                call.status === 'missed' || call.status === 'declined'
                  ? 'text-red-500'
                  : 'text-[var(--dank-accent)]'
              }`}
            >
              {statusText}
            </p>
          </>
        ) : (
          <div className="w-full space-y-4">
            <div className="text-center">
              <p className="text-sm font-bold text-[var(--dank-text)] truncate">{peerName}</p>
              <p className="text-xs font-semibold text-[var(--dank-accent)] tabular-nums mt-0.5">
                {statusText}
              </p>
              <div
                dir="ltr"
                className="mt-2 h-8 text-xl font-bold tracking-widest text-[var(--dank-text)] tabular-nums"
              >
                {dialedDigits || ' '}
              </div>
            </div>

            <div dir="ltr" className="grid grid-cols-3 gap-3.5 max-w-[260px] mx-auto">
              {KEYPAD_KEYS.map((item) => (
                <button
                  key={item.digit}
                  type="button"
                  onClick={() => {
                    playDtmfTone(item.digit);
                    setDialedDigits((prev) => `${prev}${item.digit}`.slice(-20));
                  }}
                  className="w-[74px] h-[74px] mx-auto rounded-full bg-[var(--dank-surface)] hover:bg-[var(--dank-elevated)] border border-[var(--dank-border)] flex flex-col items-center justify-center transition-transform active:scale-95 cursor-pointer"
                >
                  <span className="text-2xl font-semibold text-[var(--dank-text)] leading-none">
                    {item.digit}
                  </span>
                  {item.letters && (
                    <span className="text-[9px] font-semibold tracking-widest text-[var(--dank-muted)] mt-1">
                      {item.letters}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom iPhone Call Controls (NO Video Button) */}
      <div className="relative z-10 w-full max-w-sm pb-safe">
        {call.status === 'ringing' && isIncoming ? (
          <div className="flex items-center justify-center gap-12 pb-4">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDecline()}
                aria-label={t.calls.decline}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
              <span className="text-xs font-medium text-[var(--dank-muted)]">
                {t.calls.decline}
              </span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void handleAccept()}
                aria-label={t.calls.accept}
                className="w-16 h-16 rounded-full bg-[var(--dank-accent)] hover:bg-[var(--dank-accent-hover)] text-[var(--dank-accent-fg)] flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
              >
                <Phone className="w-7 h-7" />
              </button>
              <span className="text-xs font-medium text-[var(--dank-muted)]">
                {t.calls.accept}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-[var(--dank-surface)] border border-[var(--dank-border)] p-4 flex items-center justify-around gap-2 shadow-2xl">
            <button
              type="button"
              onClick={() => setMuted((prev) => !prev)}
              aria-label={t.calls.muteMic}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span
                className={`w-13 h-13 rounded-full flex items-center justify-center transition-colors ${
                  muted
                    ? 'bg-[var(--dank-text)] text-[var(--dank-canvas)]'
                    : 'bg-[var(--dank-elevated)] text-[var(--dank-text)] group-hover:bg-[var(--dank-hover)]'
                }`}
              >
                {muted ? <MicOff className="w-5.5 h-5.5" /> : <Mic className="w-5.5 h-5.5" />}
              </span>
              <span className="text-[11px] font-medium text-[var(--dank-muted)]">
                {t.calls.muteMic}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSpeaker((prev) => !prev)}
              aria-label={t.calls.speakerOn}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span
                className={`w-13 h-13 rounded-full flex items-center justify-center transition-colors ${
                  speaker
                    ? 'bg-[var(--dank-accent-soft)] text-[var(--dank-accent)] border border-[var(--dank-accent-border)]'
                    : 'bg-[var(--dank-elevated)] text-[var(--dank-muted)]'
                }`}
              >
                {speaker ? <Volume2 className="w-5.5 h-5.5" /> : <VolumeX className="w-5.5 h-5.5" />}
              </span>
              <span className="text-[11px] font-medium text-[var(--dank-muted)]">
                {t.calls.speakerOn}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowKeypad((prev) => !prev)}
              aria-label={showKeypad ? t.calls.hideKeypad : t.calls.keypad}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span
                className={`w-13 h-13 rounded-full flex items-center justify-center transition-colors ${
                  showKeypad
                    ? 'bg-[var(--dank-text)] text-[var(--dank-canvas)]'
                    : 'bg-[var(--dank-elevated)] text-[var(--dank-text)] group-hover:bg-[var(--dank-hover)]'
                }`}
              >
                <Grid3X3 className="w-5.5 h-5.5" />
              </span>
              <span className="text-[11px] font-medium text-[var(--dank-muted)]">
                {showKeypad ? t.calls.hideKeypad : t.calls.keypad}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleEnd()}
              aria-label={t.calls.endCall}
              className="flex flex-col items-center gap-1.5 cursor-pointer group"
            >
              <span className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-xl transition-transform active:scale-95">
                <PhoneOff className="w-6 h-6" />
              </span>
              <span className="text-[11px] font-medium text-red-500">{t.calls.endCall}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
