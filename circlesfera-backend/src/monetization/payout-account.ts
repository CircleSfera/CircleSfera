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
