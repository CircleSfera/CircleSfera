import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';

interface UseStoryPlaybackProps {
  totalStories: number;
  initialIndex: number;
  onClose: () => void;
  storyDuration?: number;
  progressInterval?: number;
  audioUrl?: string;
  isPausedOverride?: boolean;
}

export function useStoryPlayback({
  totalStories,
  initialIndex,
  onClose,
  storyDuration = 5000,
  progressInterval = 50,
  audioUrl,
  isPausedOverride = false,
}: UseStoryPlaybackProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Audio Playback Initialization
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    if (audioUrl) {
      const audio = new window.Audio(audioUrl);
      audio.loop = true;
      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, [audioUrl]);

  // Control Audio Playback State
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.muted = isMuted;
      if (isPaused || isPausedOverride) {
        audio.pause();
      } else {
        audio.play().catch((e) => logger.error('Story audio playback failed', e));
      }
    }
  }, [isMuted, isPaused, isPausedOverride]);

  // Auto-advance stories
  useEffect(() => {
    if (isPaused || isPausedOverride) return;

    const progressIncrement = (progressInterval / storyDuration) * 100;
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
  }, [isPaused, isPausedOverride, handleNext, progressInterval, storyDuration]);

  // Keyboard navigation
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
  };
}
