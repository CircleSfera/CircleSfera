import type { Post } from '../types';

/**
 * The song to play over a post's media, if any: the one attached from the
 * library, unless it is already mixed into the video (a video made in the
 * Edits Studio), which then keeps its own sound.
 */
export function libraryTrackUrl(
  post: Pick<Post, 'audio' | 'audioInVideo'>,
): string | undefined {
  if (post.audioInVideo) return undefined;
  return post.audio?.url || undefined;
}
