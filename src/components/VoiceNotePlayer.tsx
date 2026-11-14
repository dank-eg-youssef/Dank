import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCheck, Pause, Play } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getVoiceCache } from '../utils/mediaStorage';

interface VoiceNotePlayerProps {
  messageId?: string;
  audioUrl?: string;
  audioData?: string;
  duration?: number;
  waveform?: number[];
  onDarkBubble?: boolean;
  isListened?: boolean;
  onPlayed?: () => void;
}

const DEFAULT_BARS = [
  0.32, 0.55, 0.42, 0.78, 0.9, 0.6, 0.48, 0.85, 0.7, 0.35, 0.52, 0.95, 0.68, 0.45,
  0.74, 0.88, 0.58, 0.4, 0.65, 0.82, 0.5, 0.38, 0.72, 0.6, 0.44, 0.55, 0.38, 0.28,
];

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function dataUrlToBlobUrl(dataUrl: string): string | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return null;
    const header = dataUrl.slice(5, commaIdx);
    const mimeMatch = header.match(/^([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'audio/mp4';
    const b64 = dataUrl.slice(commaIdx + 1);
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  messageId,
  audioUrl,
  audioData,
  duration = 0,
  waveform,
  onDarkBubble = false,
  isListened = false,
  onPlayed,
}) => {
  const { t } = useLanguage();
  const playerId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedNotifiedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [playbackRate, setPlaybackRate] = useState<1 | 2>(1);
  const playbackRateRef = useRef<1 | 2>(1);
  playbackRateRef.current = playbackRate;
  const [localListened, setLocalListened] = useState(isListened);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    if (isListened) setLocalListened(true);
  }, [isListened]);

  useEffect(() => {
    setTotalDuration(duration);
  }, [duration]);

  const effectiveSource = useMemo(() => {
    const raw = (audioUrl || audioData || '').trim();
    if (raw) return raw;
    return getVoiceCache(messageId) || '';
  }, [audioUrl, audioData, messageId]);

  // Convert legacy base64 data URLs to Blob URLs; pass Cloudinary HTTPS audioUrl directly
  const [legacyBlobSrc, setLegacyBlobSrc] = useState<string>('');
  useEffect(() => {
    if (!effectiveSource || !effectiveSource.startsWith('data:')) {
      setLegacyBlobSrc('');
      return;
    }
    const objectUrl = dataUrlToBlobUrl(effectiveSource);
    if (objectUrl) {
      setLegacyBlobSrc(objectUrl);
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
    setLegacyBlobSrc(effectiveSource);
  }, [effectiveSource]);

  const playbackSrc = effectiveSource.startsWith('data:') ? legacyBlobSrc : effectiveSource;

  const bars = useMemo(() => {
    if (waveform && waveform.length > 0) {
      return waveform.slice(0, 32).map((v) => Math.min(1, Math.max(0.18, Number(v) || 0.2)));
    }
    return DEFAULT_BARS;
  }, [waveform]);

  // Pause other voice players when one starts
  useEffect(() => {
    const handleOtherPlay = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (detail !== playerId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    };
    window.addEventListener('dank:voice-play', handleOtherPlay);
    return () => window.removeEventListener('dank:voice-play', handleOtherPlay);
  }, [playerId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTotalDuration(audio.duration);
      }
    };
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      syncDuration();
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => {
      setPlayError(null);
      audio.playbackRate = playbackRateRef.current;
      setIsPlaying(true);
      setLocalListened(true);
      window.dispatchEvent(new CustomEvent('dank:voice-play', { detail: playerId }));
      if (!playedNotifiedRef.current) {
        playedNotifiedRef.current = true;
        onPlayed?.();
      }
    };
    const handleError = () => {
      setIsPlaying(false);
      if (playbackSrc) {
        setPlayError(t.chat.voicePlayError);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('error', handleError);
    };
  }, [playbackSrc, onPlayed, playerId, t.chat.voicePlayError]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Smooth progress timer fallback on iOS Safari WebKit
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        setCurrentTime(audio.currentTime || 0);
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setTotalDuration(audio.duration);
        }
      }
    }, 90);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  const togglePlayback = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setPlayError(null);

    const audio = audioRef.current;
    if (!audio) return;

    if (!playbackSrc) {
      setPlayError(t.chat.voicePlayError);
      return;
    }

    if (!audio.getAttribute('src')) {
      audio.src = playbackSrc;
    }

    if (audio.paused) {
      window.dispatchEvent(new CustomEvent('dank:voice-play', { detail: playerId }));
      try {
        await audio.play();
        audio.playbackRate = playbackRateRef.current;
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        setPlayError(t.chat.voicePlayError);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleSeekBar = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const dur =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : totalDuration;
    if (dur > 0) {
      const nextTime = ((index + 0.5) / bars.length) * dur;
      audio.currentTime = Math.min(dur, Math.max(0, nextTime));
      setCurrentTime(audio.currentTime);
    }
  };

  const toggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next: 1 | 2 = playbackRate === 1 ? 2 : 1;
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  const progressRatio = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col gap-1 min-w-[235px] sm:min-w-[268px] py-0.5 select-none"
    >
      {/* Hidden native <audio> element backing this single VoicePlayer */}
      <audio
        ref={audioRef}
        src={playbackSrc || undefined}
        playsInline
        preload="metadata"
        className="hidden"
      />

      {/* Single Telegram Waveform VoicePlayer: Play/Pause + Waveform + Duration + 1x/2x */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={(e) => void togglePlayback(e)}
          aria-label={isPlaying ? t.chat.pauseVoice : t.chat.playVoice}
          style={{ touchAction: 'manipulation' }}
          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[#2AABEE] hover:bg-[#229ED9] text-white flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ms-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="h-7 flex items-center gap-[2.5px]">
            {bars.map((amp, idx) => {
              const barProgress = (idx + 1) / bars.length;
              const active = barProgress <= progressRatio;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => handleSeekBar(e, idx)}
                  aria-label={`Seek waveform ${idx + 1}`}
                  style={{ height: `${Math.round(amp * 100)}%`, touchAction: 'manipulation' }}
                  className={`flex-1 min-w-[2.5px] max-w-[4px] rounded-full transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#2AABEE]'
                      : onDarkBubble
                      ? 'bg-white/30 hover:bg-white/50'
                      : 'bg-slate-400/35 dark:bg-white/25 hover:bg-[#2AABEE]/60'
                  }`}
                />
              );
            })}
          </div>

          <div
            className={`flex items-center justify-between gap-2 text-[10px] font-medium tabular-nums ${
              onDarkBubble ? 'text-sky-100/85' : 'text-slate-600 dark:text-[#8C9FB1]'
            }`}
          >
            <span dir="ltr">
              {formatDuration(isPlaying ? currentTime : 0)} / {formatDuration(totalDuration)}
            </span>

            <div className="flex items-center gap-1.5">
              {localListened && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#2AABEE]">
                  <CheckCheck className="w-3 h-3" />
                  {t.chat.voiceListened}
                </span>
              )}
              <button
                type="button"
                onClick={toggleSpeed}
                title={t.chat.voiceSpeedTooltip}
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                  onDarkBubble
                    ? 'bg-white/15 hover:bg-white/25 text-white'
                    : 'bg-[#2AABEE]/15 hover:bg-[#2AABEE]/25 text-[#2AABEE]'
                }`}
              >
                {playbackRate}x
              </button>
            </div>
          </div>
        </div>
      </div>

      {playError && (
        <p className="text-[11px] font-medium text-red-400 px-1">{playError}</p>
      )}
    </div>
  );
};
