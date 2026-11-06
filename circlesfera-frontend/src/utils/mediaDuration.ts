/** How long the length of a picked file is waited for, in ms. */
export const MEDIA_PROBE_TIMEOUT_MS = 10_000;

/** How long a file of video or sound lasts, read from the file itself. */
export function readMediaDuration(
  url: string,
  kind: 'video' | 'audio',
): Promise<number> {
  return new Promise((resolve, reject) => {
    // Named as written, not from a variable: the element is a video or a
    // sound, never one that could run what it loads.
    const el: HTMLMediaElement =
      kind === 'video'
        ? document.createElement('video')
        : document.createElement('audio');
    let settled = false;
    const timer = window.setTimeout(() => finish(null), MEDIA_PROBE_TIMEOUT_MS);
    const finish = (seconds: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (seconds !== null && Number.isFinite(seconds) && seconds > 0) {
        resolve(seconds);
      } else {
        reject(new Error('metadata'));
      }
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) {
        finish(el.duration);
        return;
      }
      // Some recordings say nothing of their length until asked for a
      // moment past their end.
      el.ondurationchange = () => {
        if (Number.isFinite(el.duration)) finish(el.duration);
      };
      el.currentTime = Number.MAX_SAFE_INTEGER;
    };
    el.onerror = () => finish(null);
    el.src = url;
  });
}
