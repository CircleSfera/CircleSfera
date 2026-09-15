import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';

export type StoryAudioClip = {
  url?: string | null;
  startMs?: number | null;
  /** Clip window in ms (media duration). Defaults to active story duration. */
  windowMs?: number | null;
};

interface UseStoryPlaybackProps {
  totalStories: number;
  initialIndex: number;
  onClose: () => void;
  /** Fallback when getDurationMs is absent. */
  storyDuration?: number;
  progressInterval?: number;
  /** Per-story display + audio window duration (ms). */
  getDurationMs?: (index: number) => number;
  /** Per-story audio clip; resolved with the active index. */
  getAudioClip?: (index: number) => StoryAudioClip | null | undefined;
  isPausedOverride?: boolean;
}

export function useStoryPlayback({
  totalStories,
  initialIndex,
  onClose,
  storyDuration = 5000,
  progressInterval = 50,
  getDurationMs,
  getAudioClip,
  isPausedOverride = false,
}: UseStoryPlaybackProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const getAudioClipRef = useRef(getAudioClip);
  getAudioClipRef.current = getAudioClip;
  const getDurationMsRef = useRef(getDurationMs);
  getDurationMsRef.current = getDurationMs;

  const resolveDurationMs = useCallback(
    (index: number) => {
      const fromGetter = getDurationMsRef.current?.(index);
      if (typeof fromGetter === 'number' && fromGetter > 0) {
        return fromGetter;
      }
      return storyDuration;
    },
    [storyDuration],
  );

  const activeDurationMs = resolveDurationMs(currentIndex);

  const handleNext = useCallback(() => {
    if (currentIndex < totalStories - 1) {
      setCurrentIndex((prev) => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, totalStories, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    const clip = getAudioClipRef.current?.(currentIndex);
    const audioUrl = clip?.url || undefined;
    if (!audioUrl) {
      return;
    }

    const startSec = Math.max(0, clip?.startMs ?? 0) / 1000;
    const windowMs = Math.max(
      500,
      clip?.windowMs ?? resolveDurationMs(currentIndex),
    );
    const windowSec = windowMs / 1000;

    const audio = new window.Audio(audioUrl);
    audio.loop = false;
    audio.currentTime = startSec;

    const onTimeUpdate = () => {
      if (audio.currentTime >= startSec + windowSec) {
        audio.currentTime = startSec;
      }
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audioRef.current = audio;

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.pause();
      audio.src = '';
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    };
  }, [currentIndex, resolveDurationMs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = isMuted;
    if (isPaused || isPausedOverride) {
      audio.pause();
      return;
    }

    const clip = getAudioClipRef.current?.(currentIndex);
    const startSec = Math.max(0, clip?.startMs ?? 0) / 1000;
    if (audio.currentTime < startSec) {
      audio.currentTime = startSec;
    }
    audio.play().catch((e) => logger.error('Story audio playback failed', e));
  }, [isMuted, isPaused, isPausedOverride, currentIndex]);

  useEffect(() => {
    if (isPaused || isPausedOverride) return;

    const duration = Math.max(500, activeDurationMs);
    const progressIncrement = (progressInterval / duration) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + progressIncrement;
      });
    }, progressInterval);

    return () => clearInterval(timer);
  }, [
    isPaused,
    isPausedOverride,
    handleNext,
    progressInterval,
    activeDurationMs,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPausedOverride) return;
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          handleNext();
          break;
        case 'ArrowLeft':
          handlePrev();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, isPausedOverride]);

  return {
    currentIndex,
    progress,
    isPaused,
    setIsPaused,
    isMuted,
    setIsMuted,
    handleNext,
    handlePrev,
    activeDurationMs,
  };
}
