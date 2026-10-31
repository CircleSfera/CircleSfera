import type { SharedPostCard } from '../components/interactive/SharedPostSticker';
import type { Post } from '../types';

/**
 * Whether "Add to your story" is offered for a post or Frame. Paid,
 * locked and archived content is never shared; the server decides the rest
 * (who can see it, and whether its author allows sharing).
 */
export function canOfferStoryShare(post: Post): boolean {
  return (
    !post.isPremium &&
    !post.isLocked &&
    !(post.priceCents && post.priceCents > 0) &&
    !post.archivedAt
  );
}

/** The card a post or Frame starts a story with, as viewers will see it. */
export function postStoryCard(post: Post): SharedPostCard {
  const first = post.media?.[0];
  return {
    id: post.id,
    type: post.type === 'FRAME' ? 'FRAME' : 'POST',
    image:
      (first?.type === 'video'
        ? first?.thumbnailUrl
        : (first?.standardUrl ?? first?.url)) ?? null,
    username: post.profile?.username ?? '',
    avatar: post.profile?.avatar ?? null,
  };
}
