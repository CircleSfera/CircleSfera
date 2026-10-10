import { Pause, Play } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';

interface VoicePlayerProps {
  voiceUrl: string;
  durationSeconds?: number;
  waveform?: number[];
}

const SPEEDS = [1, 1.5, 2];

// Shown when the message carries no waveform of its own.
const DEFAULT_BARS = [
  0.3, 0.6, 0.9, 0.4, 0.7, 0.5, 0.8, 0.3, 0.6, 0.9, 0.4, 0.7, 0.5, 0.8, 0.3,
  0.6, 0.4, 0.7, 0.5, 0.9,
];

const formatTime = (secs: number) => {
  if (!Number.isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const VoicePlayer: React.FC<VoicePlayerProps> = ({
  voiceUrl,
  durationSeconds = 0,
  waveform,
}) => {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [speedIndex, setSpeedIndex] = useState(0);

  const bars = waveform && waveform.length > 0 ? waveform : DEFAULT_BARS;

  useEffect(() => {
    const audio = new Audio(voiceUrl);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      // A recording made in the browser often reports no length (Infinity):
      // the one sent with the message stays.
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(Math.round(audio.duration));
      }
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    // The button shows what the audio is doing, not what was asked of it.
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [voiceUrl]);

  const seekTo = (targetTime: number) => {
    if (!duration || duration <= 0) return;
    const time = Math.min(duration, Math.max(0, targetTime));
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleBarsClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    seekTo(((e.clientX - rect.left) / rect.width) * duration);
  };

  const handleBarsKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = duration / bars.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      seekTo(currentTime + step);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      seekTo(currentTime - step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      seekTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      seekTo(duration);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      return;
    }
    audio.playbackRate = SPEEDS[speedIndex];
    Promise.resolve(audio.play()).catch((error) => {
      logger.error('Voice message playback failed', error);
      setIsPlaying(false);
    });
  };

  const cycleSpeed = () => {
    const nextIdx = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[nextIdx];
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center space-x-3 p-2.5 bg-white/5 border border-white/10 rounded-2xl max-w-xs sm:max-w-sm select-none">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={t(isPlaying ? 'voice.pause' : 'voice.play')}
        className="w-11 h-11 rounded-full bg-accent-blue text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shrink-0 shadow-md"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-white" aria-hidden />
        ) : (
          <Play className="w-4 h-4 fill-white ml-0.5" aria-hidden />
        )}
      </button>

      {/* The waveform is one control: pressing along it, or the arrow keys,
          moves through the message. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={t('voice.position')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={formatTime(currentTime)}
        onClick={handleBarsClick}
        onKeyDown={handleBarsKey}
        className="flex-1 flex items-center space-x-0.5 h-11 cursor-pointer group/bars rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/60"
      >
        {bars.map((barValue, idx) => {
          const barPercent = (idx / bars.length) * 100;
          const isFilled = barPercent <= progressPercent;
          const heightPx = Math.max(4, Math.min(24, Math.round(barValue * 24)));

          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed audio bar positions
              key={`bar-${barValue}-${idx}`}
              aria-hidden
              data-filled={isFilled}
              className={`w-1 rounded-full transition-all duration-150 group-hover/bars:opacity-90 ${
                isFilled ? 'bg-accent-blue' : 'bg-white/20'
              } ${isPlaying && isFilled ? 'animate-pulse' : ''}`}
              style={{ height: `${heightPx}px` }}
            />
          );
        })}
      </div>

      {/* Speed & Timer */}
      <div className="flex items-center space-x-1.5 text-[11px] font-bold text-gray-300 shrink-0">
        <span>{formatTime(currentTime > 0 ? currentTime : duration)}</span>
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label={t('voice.speed', { speed: SPEEDS[speedIndex] })}
          className="min-h-11 min-w-11 px-1.5 bg-white/10 hover:bg-white/20 active:scale-95 rounded-md text-[10px] text-accent-blue font-extrabold transition-all"
        >
          {SPEEDS[speedIndex]}x
        </button>
      </div>
    </div>
  );
};
