/**
 * What a post, a story or a Frame may hold. The app and the server both read
 * these values, so a limit changes in one place.
 */

/** A Frame's length, in seconds. */
export const FRAME_MIN_DURATION_SEC = 15;
export const FRAME_MAX_DURATION_SEC = 180;

/** The lengths offered when trimming a Frame, shortest to longest. */
export const FRAME_DURATION_PRESETS = [
  FRAME_MIN_DURATION_SEC,
  30,
  60,
  90,
  FRAME_MAX_DURATION_SEC,
] as const;

/** The longest video of a story, in seconds. */
export const STORY_MAX_DURATION_SEC = 60;

/** The longest video of a post that is not a Frame, in seconds. */
export const POST_MAX_DURATION_SEC = 300;

/** The most photos and videos one post can hold. */
export const POST_MAX_MEDIA_ITEMS = 20;

/** The largest file one upload may carry, in megabytes and in bytes. */
export const MAX_UPLOAD_MB = 100;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
