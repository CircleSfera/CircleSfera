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

// Every block among the given Profiles, as each one sees it: the others it
// is in a block with, either way. One query for a whole group.
export async function blocksAmong(
  db: BlockReader,
  profileIds: Iterable<string | null | undefined>,
): Promise<Map<string, Set<string>>> {
  const ids = [...new Set([...profileIds].filter((id): id is string => !!id))];
  const pairs = new Map<string, Set<string>>();
  if (ids.length < 2) return pairs;
  const blocks = await db.block.findMany({
    where: { blockerId: { in: ids }, blockedId: { in: ids } },
    select: { blockerId: true, blockedId: true },
  });
  const add = (a: string, b: string) => {
    const set = pairs.get(a) ?? new Set<string>();
    set.add(b);
    pairs.set(a, set);
  };
  for (const b of blocks) {
    add(b.blockerId, b.blockedId);
    add(b.blockedId, b.blockerId);
  }
  return pairs;
}

// A conversation as one person sees it: those in a block with them shown
// as unavailable.
export function maskParticipants<
  T extends { participants?: { profileId: string; profile?: object | null }[] },
>(conversation: T, blocked: Set<string> | undefined): T {
  if (!blocked?.size || !conversation.participants) return conversation;
  return {
    ...conversation,
    participants: conversation.participants.map((p) =>
      blocked.has(p.profileId) && p.profile
        ? { ...p, profile: unavailableProfile(p.profile) }
        : p,
    ),
  };
}

// A conversation as the viewer gets it in an answer.
export async function maskedForViewer<
  T extends { participants?: { profileId: string; profile?: object | null }[] },
>(db: BlockReader, viewerProfileId: string, conversation: T): Promise<T> {
  const blocked = await blockedWithViewer(
    db,
    viewerProfileId,
    (conversation.participants ?? []).map((p) => p.profileId),
  );
  return maskParticipants(conversation, blocked);
}
