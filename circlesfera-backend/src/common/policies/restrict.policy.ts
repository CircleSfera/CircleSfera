import type { Prisma } from '@prisma/client';

// Restrict policy: a Profile that restricts another keeps it at a distance
// without telling it. The restricted Profile's new comments on the
// restricter's posts wait for approval, its chat with the restricter goes to
// the restricter's requests, and it no longer sees when the restricter is
// active or has read its messages. Callers never reveal a restriction to the
// restricted Profile.

type RestrictionReader = Pick<Prisma.TransactionClient, 'restriction'>;

// True when `restricterId` restricts `restrictedId`. Never true of oneself.
export async function restricts(
  db: RestrictionReader,
  restricterId: string | null | undefined,
  restrictedId: string | null | undefined,
): Promise<boolean> {
  if (!restricterId || !restrictedId || restricterId === restrictedId) {
    return false;
  }
  const row = await db.restriction.findUnique({
    where: { restricterId_restrictedId: { restricterId, restrictedId } },
    select: { id: true },
  });
  return Boolean(row);
}

// Of `profileIds`, the ones that restrict `viewerId`: towards the viewer,
// their read receipts and active status are kept out of sight.
export async function restrictersOf(
  db: RestrictionReader,
  viewerId: string,
  profileIds: string[],
): Promise<Set<string>> {
  const others = [...new Set(profileIds)].filter((id) => id !== viewerId);
  if (others.length === 0) return new Set();
  const rows = await db.restriction.findMany({
    where: { restrictedId: viewerId, restricterId: { in: others } },
    select: { restricterId: true },
  });
  return new Set(rows.map((r) => r.restricterId));
}
