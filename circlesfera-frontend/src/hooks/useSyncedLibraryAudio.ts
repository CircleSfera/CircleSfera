import { type RefObject, useEffect, useRef } from 'react';

type VideoLike = Pick<
  HTMLVideoElement,
  'currentTime' | 'paused' | 'addEventListener' | 'removeEventListener'
>;

/**
 * Play a first-party library track synced to a video element, from audioStartMs.
 * Caller should mute the video bed when a library track is attached.
 */
export function useSyncedLibraryAudio(options: {
  enabled: boolean;
  trackUrl?: string | null;
  audioStartMs?: number | null;
  isMuted: boolean;
  videoRef: RefObject<VideoLike | null>;
}) {
  const { enabled, trackUrl, audioStartMs, isMuted, videoRef } = options;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Read when the track is made; a later change of sound goes through the
  // effect below, which does not load the track again.
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  useEffect(() => {
    if (!enabled || !trackUrl) return;

    const startSec = Math.max(0, audioStartMs ?? 0) / 1000;
    const audio = new window.Audio(trackUrl);
    audioRef.current = audio;
    audio.loop = false;
    audio.muted = isMutedRef.current;
    audio.currentTime = startSec;

    const video = videoRef.current;

    const syncFromVideo = () => {
      if (!video) return;
      const target = startSec + video.currentTime;
      if (Math.abs(audio.currentTime - target) > 0.35) {
        audio.currentTime = target;
      }
    };

    const onPlay = () => {
      syncFromVideo();
      audio.play().catch(() => {});
    };
    const onPause = () => audio.pause();
    const onSeeked = () => syncFromVideo();
    const onEnded = () => {
      audio.pause();
      audio.currentTime = startSec;
    };

    video?.addEventListener('play', onPlay);
    video?.addEventListener('pause', onPause);
    video?.addEventListener('seeked', onSeeked);
    video?.addEventListener('ended', onEnded);
    video?.addEventListener('timeupdate', syncFromVideo);

    if (video && !video.paused) {
      onPlay();
    }

    return () => {
      video?.removeEventListener('play', onPlay);
      video?.removeEventListener('pause', onPause);
      video?.removeEventListener('seeked', onSeeked);
      video?.removeEventListener('ended', onEnded);
      video?.removeEventListener('timeupdate', syncFromVideo);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [enabled, trackUrl, audioStartMs, videoRef]);

  // Switching the sound on or off keeps the same track playing: making a
  // new one would download it again and leave a gap.
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);
}
