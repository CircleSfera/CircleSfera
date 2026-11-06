import { useEffect, useState } from 'react';
import type { Clip, MediaClip } from '../../../types/studio';

const THUMB_HEIGHT = 128;
/** The moment a frame is taken from, rounded to this many seconds. */
export const THUMB_STEP_SEC = 0.5;
/** How long a frame is waited for before giving up, in ms. */
export const THUMB_TIMEOUT_MS = 8_000;
/** How many frames are kept; the oldest go first. */
export const THUMB_CACHE_SIZE = 120;

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function remember(key: string, picture: string) {
  cache.delete(key);
  cache.set(key, picture);
  if (cache.size > THUMB_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

// One capture per file and moment at a time: a clip trimmed frame by frame
// asks again and again for the same few moments.
function frameOf(key: string, url: string, at: number) {
  const running = pending.get(key);
  if (running) return running;
  const next = captureFrame(url, at).finally(() => pending.delete(key));
  pending.set(key, next);
  return next;
}

// A frame of a video, as a small picture: one per file and moment, kept for
// as long as the page is open.
function captureFrame(url: string, at: number): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    const timer = window.setTimeout(() => done(null), THUMB_TIMEOUT_MS);
    const done = (value: string | null) => {
      window.clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
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
  const at =
    Math.round((media?.mediaStart ?? 0) / THUMB_STEP_SEC) * THUMB_STEP_SEC;
  const key = media?.type === 'video' && url ? `${url}#${at}` : null;
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
    void frameOf(key, url, at).then((picture) => {
      if (!picture) return;
      remember(key, picture);
      if (live) setFrame(picture);
    });
    return () => {
      live = false;
    };
  }, [key, url, at]);

  if (media?.type === 'image') return url;
  return frame;
}
