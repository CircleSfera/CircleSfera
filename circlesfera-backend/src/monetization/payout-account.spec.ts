import { describe, expect, it, vi } from 'vitest';
import { payoutAccountOf, payoutAccountPlacement } from './payout-account.js';

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

describe('payoutAccountPlacement', () => {
  const placing = (
    row: {
      profileId: string | null;
      stripeConnectAccountId: string | null;
    } | null,
    profiles: Array<{ id: string; accountType: string }>,
    account: string | null,
  ) => {
    const { db } = reader(profiles, account);
    db.monetization = { findUnique: vi.fn().mockResolvedValue(row) };
    return db;
  };

  it('moves a row opened from a Personal Profile to the Creator Profile made since, when the account is connected', async () => {
    // The person opened their earnings from their Personal Profile, then
    // made a Creator Profile and connected an account.
    const db = placing(
      { profileId: 'personal', stripeConnectAccountId: null },
      [
        { id: 'personal', accountType: 'PERSONAL' },
        { id: 'creator', accountType: 'CREATOR' },
      ],
      'acct_new',
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({
      profileId: 'creator',
      stripeConnectAccountId: 'acct_new',
    });
  });

  it('keeps a connected account with its Profile, even one switched to Personal since', async () => {
    const db = placing(
      { profileId: 'was-creator', stripeConnectAccountId: 'acct_1' },
      [
        { id: 'was-creator', accountType: 'PERSONAL' },
        { id: 'creator', accountType: 'CREATOR' },
      ],
      'acct_1',
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({});
  });

  it('gives a Profile again to a row with an account that lost its Profile', async () => {
    const db = placing(
      { profileId: null, stripeConnectAccountId: 'acct_1' },
      [{ id: 'creator', accountType: 'CREATOR' }],
      'acct_1',
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({
      profileId: 'creator',
      stripeConnectAccountId: 'acct_1',
    });
  });

  it('never empties the account of a row when the person has no Profile left', async () => {
    const db = placing(
      { profileId: null, stripeConnectAccountId: 'acct_1' },
      [],
      null,
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({});
  });

  it('places a person without a row with their Profiles as they are', async () => {
    const db = placing(
      null,
      [{ id: 'personal', accountType: 'PERSONAL' }],
      null,
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({
      profileId: 'personal',
    });
  });
});
