import { describe, expect, it, vi } from 'vitest';
import {
  payoutAccountOf,
  payoutAccountPlacement,
  payoutRowForProfile,
} from './payout-account.js';

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
    // The person's row; no Profile holds a row of its own.
    db.monetization = {
      findUnique: vi.fn(async ({ where }: { where: object }) =>
        'userId' in where ? row : null,
      ),
    };
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

    // The account it holds is left as it is.
    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({
      profileId: 'creator',
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

  it('never places the row onto a Profile holding a row of its own', async () => {
    const db = placing(
      { profileId: null, stripeConnectAccountId: 'acct_1' },
      [{ id: 'creator', accountType: 'CREATOR' }],
      'acct_1',
    );
    db.monetization.findUnique.mockImplementation(
      async ({ where }: { where: object }) =>
        'userId' in where
          ? { profileId: null, stripeConnectAccountId: 'acct_1' }
          : { id: 'creator-own-row' },
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

describe('payoutRowForProfile', () => {
  const rows = (byProfile: object | null, byPerson: object | null) => {
    const findUnique = vi.fn(async ({ where }: { where: object }) =>
      'profileId' in where ? byProfile : byPerson,
    );
    return { db: { monetization: { findUnique } } as any, findUnique };
  };
  const profile = { id: 'creator', userId: 'u1' };

  it('pays a Profile into the account its own row holds, once it is ready', async () => {
    const own = {
      userId: null,
      stripeConnectAccountId: 'acct_own',
      transfersEnabled: true,
    };
    const { db, findUnique } = rows(own, { stripeConnectAccountId: 'acct_x' });

    await expect(payoutRowForProfile(db, profile)).resolves.toBe(own);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profileId: 'creator' } }),
    );
  });

  it("pays a Profile holding no account into its person's", async () => {
    const person = { stripeConnectAccountId: 'acct_person' };
    const { db, findUnique } = rows({ stripeConnectAccountId: null }, person);

    await expect(payoutRowForProfile(db, profile)).resolves.toBe(person);
    expect(findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('keeps paying a Profile where it was while its own account is being set up', async () => {
    const person = { stripeConnectAccountId: 'acct_person' };
    const { db } = rows(
      {
        userId: null,
        stripeConnectAccountId: 'acct_own',
        transfersEnabled: false,
      },
      person,
    );

    await expect(payoutRowForProfile(db, profile)).resolves.toBe(person);
  });

  it("pays the Profile holding the person's row into it, as before", async () => {
    const own = {
      userId: 'u1',
      stripeConnectAccountId: 'acct_first',
      transfersEnabled: false,
    };
    const { db, findUnique } = rows(own, null);

    await expect(payoutRowForProfile(db, profile)).resolves.toBe(own);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('finds nothing for a person without a row', async () => {
    const { db } = rows(null, null);
    await expect(payoutRowForProfile(db, profile)).resolves.toBeNull();
  });
});
