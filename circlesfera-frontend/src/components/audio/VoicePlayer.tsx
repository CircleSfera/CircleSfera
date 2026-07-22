import { Pause, Play } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface VoicePlayerProps {
  voiceUrl: string;
  durationSeconds?: number;
  waveform?: number[];
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({
  voiceUrl,
  durationSeconds = 0,
  waveform,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [speedIndex, setSpeedIndex] = useState(0);

  const speeds = [1, 1.5, 2];

  // Default waveform bars if not provided
  const bars =
    waveform && waveform.length > 0
      ? waveform
      : [
          0.3, 0.6, 0.9, 0.4, 0.7, 0.5, 0.8, 0.3, 0.6, 0.9, 0.4, 0.7, 0.5, 0.8,
          0.3, 0.6, 0.4, 0.7, 0.5, 0.9,
        ];

  useEffect(() => {
    const audio = new Audio(voiceUrl);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && !Number.isNaN(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [voiceUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  const cycleSpeed = () => {
    const nextIdx = (speedIndex + 1) % speeds.length;
    setSpeedIndex(nextIdx);
    const newSpeed = speeds[nextIdx];
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center space-x-3 p-2.5 bg-white/5 border border-white/10 rounded-2xl max-w-xs sm:max-w-sm">
      <button
        type="button"
        onClick={togglePlay}
        className="w-9 h-9 rounded-full bg-accent-blue text-white flex items-center justify-center hover:scale-105 transition-transform shrink-0 shadow-md"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-white" />
        ) : (
          <Play className="w-4 h-4 fill-white ml-0.5" />
        )}
      </button>

      {/* Waveform Bars */}
      <div className="flex-1 flex items-center space-x-0.5 h-7">
        {bars.map((barValue, idx) => {
          const barPercent = (idx / bars.length) * 100;
          const isFilled = barPercent <= progressPercent;
          const heightPx = Math.max(4, Math.min(24, Math.round(barValue * 24)));

          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed audio bar positions
              key={`bar-${barValue}-${idx}`}
              className={`w-1 rounded-full transition-colors ${
                isFilled ? 'bg-accent-blue' : 'bg-white/20'
              }`}
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
          className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded-md text-[10px] text-accent-blue font-extrabold"
        >
          {speeds[speedIndex]}x
        </button>
      </div>
    </div>
  );
};
