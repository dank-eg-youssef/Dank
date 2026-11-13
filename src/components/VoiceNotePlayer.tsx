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

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  audioData,
  duration = 0,
  waveform,
  onDarkBubble = false,
}) => {
  const { t } = useLanguage();
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTotalDuration(audio.duration);
      }
    };
    const handleLoadedMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setTotalDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMeta);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMeta);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.pause();
    };
  }, [audioData]);

  const togglePlayback = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
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
    <div className="flex items-center gap-2.5 min-w-[215px] sm:min-w-[245px] py-0.5 select-none">
      {audioData?.trim() ? (
        <audio ref={audioRef} src={audioData} preload="metadata" className="hidden" />
      ) : null}

      <button
        type="button"
        onClick={(e) => void togglePlayback(e)}
        aria-label={isPlaying ? t.chat.pauseVoice : t.chat.playVoice}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
          onDarkBubble
            ? 'bg-[#38BDF8] text-[#0A1931] hover:bg-[#0EA5E9]'
            : 'bg-[#0A1931] text-white hover:bg-[#13284A]'
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
                style={{ height: `${Math.round(amp * 100)}%` }}
                className={`flex-1 min-w-[2.5px] max-w-[4px] rounded-full transition-colors cursor-pointer ${
                  active
                    ? onDarkBubble
                      ? 'bg-[#38BDF8]'
                      : 'bg-[#0284C7]'
                    : onDarkBubble
                    ? 'bg-white/30 hover:bg-white/50'
                    : 'bg-[#0A1931]/20 hover:bg-[#0A1931]/35'
                }`}
              />
            );
          })}
        </div>
        <div
          className={`flex items-center justify-between text-[10px] font-medium tabular-nums ${
            onDarkBubble ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          <span>{isPlaying ? formatDuration(currentTime) : t.chat.voiceNoteLabel}</span>
          <span>{formatDuration(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
};
