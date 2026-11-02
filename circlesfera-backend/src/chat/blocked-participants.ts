import type { Prisma } from '@prisma/client';

type BlockReader = Pick<Prisma.TransactionClient, 'block'>;

// Of the given Profiles, the ones in a block with the viewer, either way.
// One query for a whole page of conversations or messages.
export async function blockedWithViewer(
  db: BlockReader,
  viewerProfileId: string | undefined,
  profileIds: Iterable<string | null | undefined>,
): Promise<Set<string>> {
  const others = [
    ...new Set(
      [...profileIds].filter(
        (id): id is string => !!id && id !== viewerProfileId,
      ),
    ),
  ];
  if (!viewerProfileId || others.length === 0) return new Set();
  const blocks = await db.block.findMany({
    where: {
      OR: [
        { blockerId: viewerProfileId, blockedId: { in: others } },
        { blockedId: viewerProfileId, blockerId: { in: others } },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(
    blocks.map((b) =>
      b.blockerId === viewerProfileId ? b.blockedId : b.blockerId,
    ),
  );
}

// A person in a block with the viewer, as a conversation shows them: still
// there, so the conversation reads as it did, but with no name, handle or
// picture to recognise them by or open their Profile from.
export function unavailableProfile<T extends object>(profile: T): T {
  const masked: Record<string, unknown> = { ...profile, unavailable: true };
  for (const key of ['username', 'avatar', 'fullName']) {
    if (key in masked) masked[key] = null;
  }
  return masked as T;
}
