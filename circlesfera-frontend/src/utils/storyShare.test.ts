import { describe, expect, it } from 'vitest';
import type { Post } from '../types';
import { canOfferStoryShare, postStoryCard } from './storyShare';

const post = (over: Partial<Post> = {}) =>
  ({
    id: 'post-1',
    type: 'POST',
    profile: { username: 'ana', avatar: 'a.jpg' },
    media: [
      {
        url: 'p.jpg',
        standardUrl: 'p-std.jpg',
        thumbnailUrl: 'p-t.jpg',
        type: 'image',
      },
    ],
    ...over,
  }) as unknown as Post;

describe('sharing a post to a story', () => {
  it('is offered for a free post on show, never for paid, locked or archived ones', () => {
    expect(canOfferStoryShare(post())).toBe(true);
    expect(canOfferStoryShare(post({ isPremium: true }))).toBe(false);
    expect(canOfferStoryShare(post({ isLocked: true }))).toBe(false);
    expect(canOfferStoryShare(post({ priceCents: 300 }))).toBe(false);
    expect(canOfferStoryShare(post({ archivedAt: '2026-10-01' }))).toBe(false);
  });

  it('starts the story with a card of the post: its picture, or a video’s cover', () => {
    expect(postStoryCard(post())).toEqual({
      id: 'post-1',
      type: 'POST',
      image: 'p-std.jpg',
      username: 'ana',
      avatar: 'a.jpg',
    });
    expect(
      postStoryCard(
        post({
          type: 'FRAME',
          media: [
            { url: 'f.mp4', thumbnailUrl: 'f-cover.jpg', type: 'video' },
          ] as never,
        }),
      ).image,
    ).toBe('f-cover.jpg');
  });
});
