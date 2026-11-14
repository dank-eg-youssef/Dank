import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { updateCallState } from '../services/chatService';
import type { CallRecord, UserPublic } from '../types/dank';
import { Avatar } from './Avatar';

interface CallModalProps {
  call: CallRecord;
  currentUser: UserPublic;
  onClose: () => void;
}

function formatCallDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const CallModal: React.FC<CallModalProps> = ({ call, currentUser, onClose }) => {
  const { t } = useLanguage();
  const isIncoming = call.calleeId === currentUser.uid;
  const peerName = isIncoming ? call.callerName : call.calleeName;
  const peerPhoto = isIncoming ? call.callerPhoto : call.calleePhoto;

  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [cameraOn, setCameraOn] = useState(call.callType === 'video');
  const [elapsed, setElapsed] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  // Optional local media stream preview
  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: call.callType === 'video' && cameraOn,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (localVideoRef.current && call.callType === 'video') {
          localVideoRef.current.srcObject = stream;
        }
      } catch {
        // Call UI remains functional even if camera/mic permission isn't granted
      }
    };

    void startMedia();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
      }
    };
  }, [call.callType, cameraOn]);

  // Mute audio tracks
  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, [muted]);

  // Auto-close after ended/declined/missed
  useEffect(() => {
    if (call.status === 'ended' || call.status === 'declined' || call.status === 'missed') {
      const id = window.setTimeout(onClose, 1200);
      return () => window.clearTimeout(id);
    }
  }, [call.status, onClose]);

  const handleAccept = async () => {
    await updateCallState(call.id, { status: 'connected' });
  };

  const handleDecline = async () => {
    await updateCallState(call.id, { status: 'declined', durationSeconds: 0 });
    onClose();
  };

  const handleEnd = async () => {
    const nextStatus = call.status === 'ringing' && !isIncoming ? 'missed' : 'ended';
    await updateCallState(call.id, { status: nextStatus, durationSeconds: elapsed });
    onClose();
  };

  const statusText =
    call.status === 'ringing'
      ? isIncoming
        ? call.callType === 'video'
          ? t.calls.incomingVideo
          : t.calls.incomingVoice
        : t.calls.ringing
      : call.status === 'connected'
      ? `${t.calls.connected} · ${formatCallDuration(elapsed)}`
      : call.status === 'declined'
      ? t.calls.declined
      : call.status === 'missed'
      ? t.calls.missed
      : t.calls.ended;

  return (
    <div className="fixed inset-0 z-[70] bg-[#041b11]/95 backdrop-blur-md flex flex-col items-center justify-between p-6 text-white">
      <div className="w-full max-w-md flex items-center justify-between text-xs text-emerald-100/80">
        <span className="inline-flex items-center gap-1.5 font-semibold text-[#25D366]">
          {call.callType === 'video' ? (
            <Video className="w-4 h-4" />
          ) : (
            <Phone className="w-4 h-4" />
          )}
          {call.callType === 'video' ? t.calls.videoCall : t.calls.voiceCall}
        </span>
        <span className="font-semibold tracking-wide">DANK</span>
      </div>

      {/* Center Peer / Video Area */}
      <div className="flex flex-col items-center text-center gap-4 my-auto w-full max-w-sm">
        {call.callType === 'video' && cameraOn ? (
          <div className="relative w-full aspect-[3/4] max-h-[380px] rounded-3xl overflow-hidden bg-[#0a2e1f] border border-[#25D366]/30 shadow-2xl flex items-center justify-center">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute top-3 start-3 px-2.5 py-1 rounded-full bg-black/50 text-[11px] font-semibold">
              {peerName}
            </div>
          </div>
        ) : (
          <div className="relative">
            {call.status === 'ringing' && (
              <div className="absolute -inset-4 rounded-full bg-[#25D366]/20 animate-ping" />
            )}
            <Avatar src={peerPhoto} name={peerName} size="xl" />
          </div>
        )}

        <div>
          <h2 className="text-2xl font-bold text-white">{peerName}</h2>
          <p className="mt-1 text-sm font-medium text-[#25D366] tabular-nums">{statusText}</p>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="w-full max-w-sm flex items-center justify-center gap-4 pb-4">
        {call.status === 'ringing' && isIncoming ? (
          <>
            <button
              type="button"
              onClick={() => void handleDecline()}
              aria-label={t.calls.decline}
              className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex flex-col items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => void handleAccept()}
              aria-label={t.calls.accept}
              className="w-16 h-16 rounded-full bg-[#25D366] hover:bg-[#1ebe5d] text-[#041f14] flex flex-col items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
            >
              <Phone className="w-6 h-6" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setMuted((prev) => !prev)}
              aria-label={t.calls.muteMic}
              className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                muted ? 'bg-white text-[#0a2e1f]' : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
            >
              {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {call.callType === 'video' && (
              <button
                type="button"
                onClick={() => setCameraOn((prev) => !prev)}
                aria-label={t.calls.cameraToggle}
                className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                  !cameraOn ? 'bg-white text-[#0a2e1f]' : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
              >
                {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => setSpeaker((prev) => !prev)}
              aria-label={t.calls.speakerOn}
              className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                speaker ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50'
              }`}
            >
              {speaker ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => void handleEnd()}
              aria-label={t.calls.endCall}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
