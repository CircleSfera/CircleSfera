import { FIRST_PAID_ITEMS_REVIEWED_BY_STAFF } from '@circlesfera/shared';
import type { Prisma } from '@prisma/client';

type Reader = Pick<Prisma.TransactionClient, 'post' | 'story'>;

/** Priced and passed by a person on staff. */
export const PASSED_BY_STAFF = {
  priceCents: { gt: 0 },
  moderationPassedByStaff: true,
} as const;

/**
 * How many priced posts and stories of a Profile a person on staff has
 * passed. Content its author deleted still counts: it was looked at.
 */
export async function staffPassedPaidCount(
  db: Reader,
  profileId: string,
): Promise<number> {
  const [posts, stories] = await Promise.all([
    db.post.count({ where: { profileId, ...PASSED_BY_STAFF } }),
    db.story.count({ where: { profileId, ...PASSED_BY_STAFF } }),
  ]);
  return posts + stories;
}

/**
 * Whether a person on staff, not automatic moderation, must pass this post
 * or story before it is sold: it is priced, and its Profile has fewer than
 * FIRST_PAID_ITEMS_REVIEWED_BY_STAFF priced items passed by a person. A free
 * item, or one that is gone, never waits.
 */
export async function awaitsStaffPaidReview(
  db: Reader,
  type: 'POST' | 'STORY',
  id: string,
): Promise<boolean> {
  const select = { priceCents: true, profileId: true } as const;
  const item =
    type === 'POST'
      ? await db.post.findUnique({ where: { id }, select })
      : await db.story.findUnique({ where: { id }, select });
  if (!item || !(item.priceCents > 0)) return false;
  return (
    (await staffPassedPaidCount(db, item.profileId)) <
    FIRST_PAID_ITEMS_REVIEWED_BY_STAFF
  );
}
