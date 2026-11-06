import { useEffect, useState } from 'react';
import type { Clip, MediaClip } from '../../../types/studio';

const THUMB_HEIGHT = 128;
const cache = new Map<string, string>();

// A frame of a video, as a small picture: one per file and moment, kept for
// as long as the page is open.
function captureFrame(url: string, at: number): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    const done = (value: string | null) => {
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    video.onloadeddata = () => {
      video.currentTime = Math.min(at, Math.max(0, video.duration - 0.05));
    };
    video.onseeked = () => {
      try {
        const scale = THUMB_HEIGHT / (video.videoHeight || THUMB_HEIGHT);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round((video.videoWidth || THUMB_HEIGHT) * scale);
        canvas.height = THUMB_HEIGHT;
        canvas
          .getContext('2d')
          ?.drawImage(video, 0, 0, canvas.width, canvas.height);
        done(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        done(null);
      }
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** A picture of what a clip shows, for the timeline; none for sound or text. */
export function useClipThumbnail(clip: Clip): string | null {
  const media =
    clip.type === 'video' || clip.type === 'image' ? (clip as MediaClip) : null;
  const url = media?.fileUrl ?? null;
  const at = media?.mediaStart ?? 0;
  const key = media?.type === 'video' && url ? `${url}#${at.toFixed(1)}` : null;
  const [frame, setFrame] = useState<string | null>(() =>
    key ? (cache.get(key) ?? null) : null,
  );

  useEffect(() => {
    if (!key || !url) return;
    const known = cache.get(key);
    if (known) {
      setFrame(known);
      return;
    }
    let live = true;
    void captureFrame(url, at).then((picture) => {
      if (!picture) return;
      cache.set(key, picture);
      if (live) setFrame(picture);
    });
    return () => {
      live = false;
    };
  }, [key, url, at]);

  if (media?.type === 'image') return url;
  return frame;
}
