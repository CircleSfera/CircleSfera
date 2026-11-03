/** The most photos and videos one post can hold, shared with the app. */
export { POST_MAX_MEDIA_ITEMS } from '@circlesfera/shared';

/** The kinds of picture, by the end of its address, a frame's cover may be. */
export const FRAME_COVER_IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
] as const;
