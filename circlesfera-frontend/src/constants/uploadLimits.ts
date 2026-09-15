// Must stay aligned with backend `uploads.controller.ts` and nginx `client_max_body_size`.
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_MB = 100;

/** Keep in sync with backend `media-duration.constants.ts`. */
export const FRAME_MIN_DURATION_SEC = 15;
export const FRAME_MAX_DURATION_SEC = 90;
export const STORY_MAX_DURATION_SEC = 60;
export const POST_MAX_DURATION_SEC = 300;

/** Probe video duration via HTMLVideoElement metadata. */
export function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('invalid_duration'));
        return;
      }
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('probe_failed'));
    };
    video.src = url;
  });
}
