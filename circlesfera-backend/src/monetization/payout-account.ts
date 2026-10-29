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
  // Never onto a Profile that holds a row of its own.
  const taken =
    profileId && profileId !== row?.profileId
      ? await db.monetization.findUnique({
          where: { profileId },
          select: { id: true },
        })
      : null;
  // Only what is known, and never over an account the row already holds.
  return {
    ...(profileId && !taken ? { profileId } : {}),
    ...(stripeConnectAccountId && !row?.stripeConnectAccountId
      ? { stripeConnectAccountId }
      : {}),
  };
}

const PAYOUT_ROW = {
  userId: true,
  profileId: true,
  stripeConnectAccountId: true,
  transfersEnabled: true,
  chargesEnabled: true,
  verifiedCompany: true,
} as const;

/**
 * The row of the payout account that money earned by a Profile goes to: the
 * one the Profile holds once the provider lets it receive transfers, else
 * its person's. A Profile that starts opening an account of its own keeps
 * being paid where it was until that account is ready.
 */
export async function payoutRowForProfile(
  db: Pick<Prisma.TransactionClient, 'monetization'>,
  profile: { id: string; userId: string },
) {
  // One query at a time: inside a transaction there is one connection.
  const own = await db.monetization.findUnique({
    where: { profileId: profile.id },
    select: PAYOUT_ROW,
  });
  if (own?.stripeConnectAccountId && (own.userId || own.transfersEnabled)) {
    return own;
  }
  return db.monetization.findUnique({
    where: { userId: profile.userId },
    select: PAYOUT_ROW,
  });
}
