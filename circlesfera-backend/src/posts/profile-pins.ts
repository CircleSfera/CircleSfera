import type { Prisma } from '@prisma/client';
import { LISTED_POST } from '../common/policies/removed-content.policy.js';

type PinReader = Pick<Prisma.TransactionClient, 'post' | 'postCollaborator'>;

// How many posts a Profile has pinned on its profile: its own, and those it
// co-authors and pinned as collaborator. Archived, deleted and removed posts
// do not count. Both kinds share PROFILE_PINS_MAX.
export async function countProfilePins(
  db: PinReader,
  profileId: string,
): Promise<number> {
  const [own, asCollaborator] = await Promise.all([
    db.post.count({
      where: { profileId, pinnedToProfileAt: { not: null }, ...LISTED_POST },
    }),
    db.postCollaborator.count({
      where: {
        profileId,
        status: 'ACCEPTED',
        pinnedAt: { not: null },
        post: LISTED_POST,
      },
    }),
  ]);
  return own + asCollaborator;
}
