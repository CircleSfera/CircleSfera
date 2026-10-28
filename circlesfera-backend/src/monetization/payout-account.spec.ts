import { describe, expect, it, vi } from 'vitest';
import { payoutAccountOf } from './payout-account.js';

const reader = (
  profiles: Array<{ id: string; accountType: string }>,
  account: string | null = 'acct_1',
) => {
  const findMany = vi.fn().mockResolvedValue(
    profiles.map((profile) => ({
      ...profile,
      user: { stripeConnectAccountId: account },
    })),
  );
  return { db: { profile: { findMany } } as any, findMany };
};

describe('payoutAccountOf', () => {
  it("keeps the person's account with their oldest earning Profile, before an older personal one", async () => {
    const { db, findMany } = reader([
      { id: 'personal-oldest', accountType: 'PERSONAL' },
      { id: 'creator', accountType: 'CREATOR' },
      { id: 'business', accountType: 'BUSINESS' },
    ]);

    await expect(payoutAccountOf(db, 'u1')).resolves.toEqual({
      profileId: 'creator',
      stripeConnectAccountId: 'acct_1',
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('keeps it with their oldest Profile when none earns', async () => {
    const { db } = reader(
      [
        { id: 'first', accountType: 'PERSONAL' },
        { id: 'second', accountType: 'PERSONAL' },
      ],
      null,
    );

    await expect(payoutAccountOf(db, 'u1')).resolves.toEqual({
      profileId: 'first',
      stripeConnectAccountId: null,
    });
  });

  it('names no Profile and no account for a person without Profiles', async () => {
    const { db } = reader([]);

    await expect(payoutAccountOf(db, 'u1')).resolves.toEqual({
      profileId: null,
      stripeConnectAccountId: null,
    });
  });
});
