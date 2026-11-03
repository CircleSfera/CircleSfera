// The limits the app and the server share; the server and nginx's
// `client_max_body_size` follow the same upload size.
export {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  POST_MAX_DURATION_SEC,
  POST_MAX_MEDIA_ITEMS,
  STORY_MAX_DURATION_SEC,
} from '@circlesfera/shared';

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
