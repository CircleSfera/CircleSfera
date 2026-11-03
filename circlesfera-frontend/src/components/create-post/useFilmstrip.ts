import { useEffect, useState } from 'react';

/** The frame pictures drawn, as small JPEGs. */
const FRAME_SIZE = { width: 64, height: 114 };
const FRAME_QUALITY = 0.6;

/**
 * Pictures of a clip at `count` moments spread over its length, for the
 * strip of the timeline. Answers none while they are drawn, or when the
 * browser cannot draw them; the strip then shows the clip's first frame.
 */
export function useFilmstrip(file: File, ms: number, count: number): string[] {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_SIZE.width;
    canvas.height = FRAME_SIZE.height;
    const context = canvas.getContext('2d');

    const seek = (sec: number) =>
      new Promise<void>((resolve, reject) => {
        video.addEventListener('seeked', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(video.error), {
          once: true,
        });
        video.currentTime = sec;
      });

    void (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadeddata', () => resolve(), { once: true });
          video.addEventListener('error', () => reject(video.error), {
            once: true,
          });
        });
        const drawn: string[] = [];
        for (let i = 0; i < count && !cancelled; i++) {
          await seek((((i + 0.5) / count) * ms) / 1000);
          if (!context) break;
          // As object-cover: the middle of the picture, at the frame's shape.
          const scale = Math.max(
            FRAME_SIZE.width / video.videoWidth,
            FRAME_SIZE.height / video.videoHeight,
          );
          const width = video.videoWidth * scale;
          const height = video.videoHeight * scale;
          context.drawImage(
            video,
            (FRAME_SIZE.width - width) / 2,
            (FRAME_SIZE.height - height) / 2,
            width,
            height,
          );
          drawn.push(canvas.toDataURL('image/jpeg', FRAME_QUALITY));
        }
        if (!cancelled) setFrames(drawn);
      } catch {
        // No pictures: the strip shows the clip's first frame instead.
      }
    })();
    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };
  }, [file, ms, count]);
  return frames;
}
