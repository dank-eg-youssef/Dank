import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface VoiceNotePlayerProps {
  audioData: string;
  duration?: number;
  waveform?: number[];
  onDarkBubble?: boolean;
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
  audioData,
  duration = 0,
  waveform,
  onDarkBubble = false,
}) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [shouldLoadAudio, setShouldLoadAudio] = useState(false);
  const [blobSrc, setBlobSrc] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);

  const bars = useMemo(() => {
    if (waveform && waveform.length > 0) {
      return waveform.slice(0, 32).map((v) => Math.min(1, Math.max(0.18, Number(v) || 0.2)));
    }
    return DEFAULT_BARS;
  }, [waveform]);

  useEffect(() => {
    setTotalDuration(duration);
  }, [duration]);

  // Lazy-mount <audio> via IntersectionObserver (or immediately when user taps play)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || shouldLoadAudio) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoadAudio(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadAudio(true);
          observer.disconnect();
        }
      },
      { rootMargin: '180px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoadAudio]);

  // Convert data: URI to Blob Object URL so iPhone Safari reliably plays & seeks
  useEffect(() => {
    if (!shouldLoadAudio || !audioData?.trim()) {
      setBlobSrc('');
      return;
    }
    if (!audioData.startsWith('data:')) {
      setBlobSrc(audioData);
      return;
    }
    const objectUrl = dataUrlToBlobUrl(audioData);
    if (objectUrl) {
      setBlobSrc(objectUrl);
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
    setBlobSrc(audioData);
  }, [shouldLoadAudio, audioData]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !blobSrc) return;

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
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('error', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('error', handlePause);
      audio.pause();
    };
  }, [blobSrc]);

  // Fallback interval timer for smooth progress bar animation on iOS Safari WebKit
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
    }, 100);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  const togglePlayback = async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();

    let srcToPlay = blobSrc;
    if (!shouldLoadAudio) {
      setShouldLoadAudio(true);
    }

    const audio = audioRef.current;
    if (!audio) return;

    // Ensure src is assigned synchronously during iOS user gesture handler
    if (!audio.getAttribute('src') && audioData?.trim()) {
      if (!srcToPlay && audioData.startsWith('data:')) {
        srcToPlay = dataUrlToBlobUrl(audioData) || audioData;
        setBlobSrc(srcToPlay);
      } else if (!srcToPlay) {
        srcToPlay = audioData;
        setBlobSrc(srcToPlay);
      }
      if (srcToPlay) {
        audio.src = srcToPlay;
      }
    }

    if (audio.paused) {
      try {
        setIsPlaying(true);
        await audio.play();
      } catch {
        // Fallback retry using raw audioData if Blob URL codec differed
        if (audioData && audio.src !== audioData) {
          try {
            audio.src = audioData;
            await audio.play();
            setIsPlaying(true);
            return;
          } catch {
            // ignore
          }
        }
        setIsPlaying(false);
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

  const progressRatio = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-2.5 min-w-[220px] sm:min-w-[255px] py-0.5 select-none"
    >
      <audio
        ref={audioRef}
        src={blobSrc || undefined}
        playsInline
        preload="metadata"
        className="hidden"
      />

      <button
        type="button"
        onClick={(e) => void togglePlayback(e)}
        aria-label={isPlaying ? t.chat.pauseVoice : t.chat.playVoice}
        style={{ touchAction: 'manipulation' }}
        className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
          onDarkBubble
            ? 'bg-[#25D366] text-[#041f14] hover:bg-[#1ebe5d]'
            : 'bg-[#0a2e1f] dark:bg-[#25D366] text-white dark:text-[#041f14] hover:opacity-90'
        }`}
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
                    ? onDarkBubble
                      ? 'bg-[#25D366]'
                      : 'bg-[#25D366]'
                    : onDarkBubble
                    ? 'bg-white/30 hover:bg-white/50'
                    : 'bg-[#0a2e1f]/20 dark:bg-white/25 hover:bg-[#0a2e1f]/35'
                }`}
              />
            );
          })}
        </div>
        <div
          className={`flex items-center justify-between text-[10px] font-medium tabular-nums ${
            onDarkBubble ? 'text-emerald-100/80' : 'text-slate-600 dark:text-emerald-100/70'
          }`}
        >
          <span>{isPlaying ? formatDuration(currentTime) : t.chat.voiceNoteLabel}</span>
          <span>{formatDuration(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
};
