import type { Prisma } from '@prisma/client';

// Block policy: a block hides two Profiles from each
// other in both directions, on every surface. Callers must answer a blocked
// viewer as if the target did not exist (NotFound, never Forbidden) so the
// block itself is never revealed.

type BlockReader = Pick<Prisma.TransactionClient, 'block'>;

// True when either Profile has blocked the other. Self-checks and anonymous
// viewers are never blocked.
export async function isBlockedEitherWay(
  db: BlockReader,
  profileA: string | null | undefined,
  profileB: string | null | undefined,
): Promise<boolean> {
  if (!profileA || !profileB || profileA === profileB) return false;
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

// Prisma `Profile` filter excluding Profiles in a block relation with the
// viewer. Returns an empty filter for anonymous viewers.
export function notBlockedWithViewer(
  viewerProfileId: string | null | undefined,
): Prisma.ProfileWhereInput {
  if (!viewerProfileId) return {};
  return {
    blocking: { none: { blockedId: viewerProfileId } },
    blockedBy: { none: { blockerId: viewerProfileId } },
  };
}
