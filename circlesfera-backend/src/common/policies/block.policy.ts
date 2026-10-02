import type { Prisma } from '@prisma/client';

import { profileAudiences } from './test-account.policy.js';

// Block policy: a block hides two Profiles from each
// other in both directions, on every surface. Callers must answer a blocked
// viewer as if the target did not exist (NotFound, never Forbidden) so the
// block itself is never revealed.
//
// Profiles of different audiences (Test Account vs real, PD-006) are treated
// exactly like a block, so every surface that honours blocks also keeps the
// audiences apart. Anonymous viewers belong to the real audience.

type BlockReader = Pick<Prisma.TransactionClient, 'block' | 'profile' | 'user'>;

// True when either Profile has blocked the other, or they belong to different
// audiences. Self-checks are never blocked; an anonymous viewer is blocked
// only from Test Account Profiles.
export async function isBlockedEitherWay(
  db: BlockReader,
  profileA: string | null | undefined,
  profileB: string | null | undefined,
): Promise<boolean> {
  if (!profileB || profileA === profileB) return false;
  const audiences = await profileAudiences(db, [profileA, profileB]);
  const audienceA = profileA ? audiences.get(profileA) : false;
  const audienceB = audiences.get(profileB);
  if (
    audienceA !== undefined &&
    audienceB !== undefined &&
    audienceA !== audienceB
  ) {
    return true;
  }
  if (!profileA) return false;
  const block = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: profileA, blockedId: profileB },
        { blockerId: profileB, blockedId: profileA },
      ],
    },
    select: { id: true },
  });
  return Boolean(block);
}

// Profile ids that `profileId` has blocked or been blocked by.
export async function getBlockedProfileIds(
  db: BlockReader,
  profileId: string | null | undefined,
): Promise<string[]> {
  if (!profileId) return [];
  const blocks = await db.block.findMany({
    where: { OR: [{ blockerId: profileId }, { blockedId: profileId }] },
    select: { blockerId: true, blockedId: true },
  });
  return blocks.map((b) =>
    b.blockerId === profileId ? b.blockedId : b.blockerId,
  );
}

// Prisma `Profile` filter keeping only Profiles the viewer may see: not in a
// block relation with the viewer and in the viewer's audience (PD-006).
// Anonymous viewers see only real accounts.
export async function visibleToViewerWhere(
  db: BlockReader,
  viewerProfileId: string | null | undefined,
): Promise<Prisma.ProfileWhereInput> {
  const isTest = viewerProfileId
    ? ((await profileAudiences(db, [viewerProfileId])).get(viewerProfileId) ??
      false)
    : false;
  const audience = { user: { isTestAccount: isTest } };
  if (!viewerProfileId) return audience;
  return {
    ...audience,
    blocking: { none: { blockedId: viewerProfileId } },
    blockedBy: { none: { blockerId: viewerProfileId } },
  };
}
