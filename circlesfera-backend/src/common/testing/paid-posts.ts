import { expect } from 'vitest';
import { PostPaywallService } from '../../posts/services/post-paywall.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

// A paid post, its author, someone who paid to unlock it and someone who did
// not, for the tests of every list that shows posts. The paywall used is the
// real one, over a database that knows only who unlocked what.

export const PAID_POST_ID = 'paid-post';
export const AUTHOR_ID = 'paid-author';
export const BUYER_ID = 'paid-buyer';
export const STRANGER_ID = 'paid-stranger';

// Every full address of the paid post's files is on this host: a closed post
// names none of them.
const FILES_HOST = 'files.example';
export const FULL_URL = `https://${FILES_HOST}/posts/photo.jpg`;
export const FULL_STANDARD_URL = `https://${FILES_HOST}/posts/master.m3u8`;
const INLINE_URL = `https://${FILES_HOST}/legacy/photo.jpg`;
const INLINE_STANDARD_URL = `https://${FILES_HOST}/legacy/master.m3u8`;

// The real paywall over a database where the buyer has unlocked the paid
// post. A Profile's account is `user-of-<profileId>`.
export function realPaywall(): PostPaywallService {
  const prisma = {
    profile: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        userId: `user-of-${where.id}`,
      }),
    },
    postUnlock: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        where.userId === `user-of-${BUYER_ID}`
          ? [{ postId: PAID_POST_ID }]
          : [],
    },
  };
  return new PostPaywallService(prisma as unknown as PrismaService);
}

// A photo of the paid post as the database returns it with its linked Media
// row (`media: { include: { media: true } }`).
export function linkedPaidMedia() {
  return {
    id: 'paid-media',
    url: INLINE_URL,
    standardUrl: INLINE_STANDARD_URL,
    thumbnailUrl: null,
    type: 'image',
    media: {
      url: FULL_URL,
      standardUrl: FULL_STANDARD_URL,
      thumbnailUrl: null,
      status: 'READY',
    },
  };
}

// The same photo as the database returns it without the linked row
// (`media: true`): the addresses are the row's own.
export function inlinePaidMedia() {
  return {
    id: 'paid-media',
    url: FULL_URL,
    standardUrl: FULL_STANDARD_URL,
    thumbnailUrl: null,
    type: 'image',
  };
}

export function paidPost<T extends object>(
  media: T[],
  extra: Record<string, unknown> = {},
) {
  return {
    id: PAID_POST_ID,
    profileId: AUTHOR_ID,
    isPremium: true,
    caption: 'paid',
    media,
    ...extra,
  };
}

// Closed: marked locked, and no full address of its files anywhere in it.
export function expectClosed(post: unknown) {
  expect(post).toMatchObject({ isLocked: true });
  expect(JSON.stringify(post)).not.toContain(FILES_HOST);
}

// Whole: not locked, with the full address of its photo.
export function expectWhole(post: unknown, url: string = FULL_URL) {
  expect((post as { isLocked?: boolean }).isLocked).toBeUndefined();
  expect(JSON.stringify(post)).toContain(url);
}
