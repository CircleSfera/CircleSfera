import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';

interface AudioPlayerProps {
  src: string;
  created?: boolean;
}

// A recording made in the browser often reports no length until it has been
// played to the end: its duration is then Infinity, or not a number.
const knownLength = (seconds: number) =>
  Number.isFinite(seconds) && seconds > 0 ? seconds : 0;

const formatTime = (time: number) => {
  if (!Number.isFinite(time) || time < 0) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function AudioPlayer({ src }: AudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(knownLength(audio.duration));
    // The button shows what the audio is doing, not what was asked of it.
    const onPlay = () => setIsPlaying(true);
    const onStop = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onStop);
    audio.addEventListener('ended', onStop);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onStop);
      audio.removeEventListener('ended', onStop);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      return;
    }
    Promise.resolve(audio.play()).catch((error) => {
      logger.error('Audio playback failed', error);
      setIsPlaying(false);
    });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const changeSpeed = () => {
    const newSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  return (
    <div className="flex items-center gap-3 bg-neutral-800/80 backdrop-blur-md p-2 rounded-full border border-white/10 min-w-60">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={t(isPlaying ? 'voice.pause' : 'voice.play')}
        className="w-11 h-11 flex items-center justify-center bg-blue-500 rounded-full text-white shrink-0 hover:bg-blue-600 transition-colors"
      >
        {isPlaying ? (
          <Pause size={16} fill="currentColor" aria-hidden />
        ) : (
          <Play size={16} fill="currentColor" className="ml-0.5" aria-hidden />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <input
          type="range"
          min={0}
          // With no known length there is nowhere to move to yet.
          max={Math.max(duration, currentTime)}
          value={currentTime}
          onChange={handleSeek}
          aria-label={t('voice.position')}
          aria-valuetext={formatTime(currentTime)}
          className="w-full h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        />
        <div className="flex justify-between text-xs text-gray-300 font-medium px-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={changeSpeed}
        aria-label={t('voice.speed', { speed })}
        className="min-h-11 min-w-11 px-2 rounded-md text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-colors shrink-0 text-center"
      >
        {speed}x
      </button>

      <audio ref={audioRef} src={src} className="hidden">
        <track kind="captions" />
      </audio>
    </div>
  );
}
