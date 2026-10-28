import type { Prisma } from '@prisma/client';

type PayoutAccountReader = Pick<Prisma.TransactionClient, 'profile'>;

/**
 * Where a person's payout account is kept while each earning Profile does
 * not hold one of its own yet: the Profile holding it (their oldest Creator
 * or Business Profile, else their oldest) and the account. A new row of
 * earnings is written with both, next to the account on the person.
 */
export async function payoutAccountOf(
  db: PayoutAccountReader,
  userId: string,
): Promise<{
  profileId: string | null;
  stripeConnectAccountId: string | null;
}> {
  const profiles = await db.profile.findMany({
    where: { userId },
    select: {
      id: true,
      accountType: true,
      user: { select: { stripeConnectAccountId: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const holder =
    profiles.find((profile) => profile.accountType !== 'PERSONAL') ??
    profiles[0];
  return {
    profileId: holder?.id ?? null,
    stripeConnectAccountId: holder?.user.stripeConnectAccountId ?? null,
  };
}

/**
 * What a write of a person's row of earnings sets for its Profile and
 * account. A connected account stays with the Profile holding it, even one
 * switched to Personal since, so its balance stays where it was earned.
 * Until an account is connected, or when the row has lost its Profile, the
 * row is placed again with the person's Profiles as they are now: a Creator
 * Profile made after the row was opened from a Personal one gets the
 * account when it is connected.
 */
export async function payoutAccountPlacement(
  db: Pick<Prisma.TransactionClient, 'profile' | 'monetization'>,
  userId: string,
): Promise<{
  profileId?: string | null;
  stripeConnectAccountId?: string | null;
}> {
  const row = await db.monetization.findUnique({
    where: { userId },
    select: { profileId: true, stripeConnectAccountId: true },
  });
  if (row?.profileId && row.stripeConnectAccountId) return {};
  const { profileId, stripeConnectAccountId } = await payoutAccountOf(
    db,
    userId,
  );
  // Only what is known: an account already on the row is never emptied.
  return {
    ...(profileId ? { profileId } : {}),
    ...(stripeConnectAccountId ? { stripeConnectAccountId } : {}),
  };
}
