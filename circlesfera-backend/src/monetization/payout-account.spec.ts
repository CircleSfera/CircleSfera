import { ErrorCode, MONETIZATION_MIN_AGE } from '@circlesfera/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  assertMonetizationApproved,
  assertOfChargingAge,
  isOfChargingAge,
  payoutAccountOf,
  payoutAccountPlacement,
  payoutDestinationFor,
  payoutRowForProfile,
} from './payout-account.js';

const reader = (profiles: Array<{ id: string; accountType: string }>) => {
  const findMany = vi.fn().mockResolvedValue(profiles);
  return { db: { profile: { findMany } } as any, findMany };
};

describe('payoutAccountOf', () => {
  it("places the person's row with their oldest earning Profile, before an older personal one", async () => {
    const { db, findMany } = reader([
      { id: 'personal-oldest', accountType: 'PERSONAL' },
      { id: 'creator', accountType: 'CREATOR' },
      { id: 'business', accountType: 'BUSINESS' },
    ]);

    await expect(payoutAccountOf(db, 'u1')).resolves.toEqual({
      profileId: 'creator',
    });
    // Only the Profiles are read: the account is never taken from the person.
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      select: { id: true, accountType: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('keeps it with their oldest Profile when none earns', async () => {
    const { db } = reader([
      { id: 'first', accountType: 'PERSONAL' },
      { id: 'second', accountType: 'PERSONAL' },
    ]);

    await expect(payoutAccountOf(db, 'u1')).resolves.toEqual({
      profileId: 'first',
    });
  });

  it('names no Profile for a person without Profiles', async () => {
    const { db } = reader([]);

    await expect(payoutAccountOf(db, 'u1')).resolves.toEqual({
      profileId: null,
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
  ) => {
    const { db } = reader(profiles);
    // The person's row; no Profile holds a row of its own.
    db.monetization = {
      findUnique: vi.fn(async ({ where }: { where: object }) =>
        'userId' in where ? row : null,
      ),
    };
    return db;
  };

  it('moves a row opened from a Personal Profile to the Creator Profile made since, and never sets its account', async () => {
    // The person opened their earnings from their Personal Profile, then
    // made a Creator Profile. Connecting writes the account, not this.
    const db = placing(
      { profileId: 'personal', stripeConnectAccountId: null },
      [
        { id: 'personal', accountType: 'PERSONAL' },
        { id: 'creator', accountType: 'CREATOR' },
      ],
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({
      profileId: 'creator',
    });
  });

  it('keeps a connected account with its Profile, even one switched to Personal since', async () => {
    const db = placing(
      { profileId: 'was-creator', stripeConnectAccountId: 'acct_1' },
      [
        { id: 'was-creator', accountType: 'PERSONAL' },
        { id: 'creator', accountType: 'CREATOR' },
      ],
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({});
  });

  it('gives a Profile again to a row with an account that lost its Profile', async () => {
    const db = placing({ profileId: null, stripeConnectAccountId: 'acct_1' }, [
      { id: 'creator', accountType: 'CREATOR' },
    ]);

    // The account it holds is left as it is.
    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({
      profileId: 'creator',
    });
  });

  it('never empties the account of a row when the person has no Profile left', async () => {
    const db = placing(
      { profileId: null, stripeConnectAccountId: 'acct_1' },
      [],
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({});
  });

  it('never places the row onto a Profile holding a row of its own', async () => {
    const db = placing({ profileId: null, stripeConnectAccountId: 'acct_1' }, [
      { id: 'creator', accountType: 'CREATOR' },
    ]);
    db.monetization.findUnique.mockImplementation(
      async ({ where }: { where: object }) =>
        'userId' in where
          ? { profileId: null, stripeConnectAccountId: 'acct_1' }
          : { id: 'creator-own-row' },
    );

    await expect(payoutAccountPlacement(db, 'u1')).resolves.toEqual({});
  });

  it('places a person without a row with their Profiles as they are', async () => {
    const db = placing(null, [{ id: 'personal', accountType: 'PERSONAL' }]);

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

// A date of birth this many years ago, a little past the birthday.
const yearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 2);
  return d;
};

describe('payoutDestinationFor', () => {
  const standing = (over: object = {}, user: object = {}) => ({
    isAccountBanned: false,
    suspendedUntil: null,
    monetizationStatus: 'APPROVED',
    ...over,
    user: {
      isActive: true,
      isRootBanned: false,
      deletedAt: null,
      identityVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      dateOfBirth: new Date('1990-05-01T00:00:00.000Z'),
      dateOfBirthVerified: true,
      ...user,
    },
  });
  const db = (seller: object | null) =>
    ({
      profile: { findUnique: vi.fn().mockResolvedValue(seller) },
      monetization: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ stripeConnectAccountId: 'acct_1' }),
      },
    }) as any;
  const profile = { id: 'creator', userId: 'u1' };

  it('sends a payment to a Profile in good standing to its account', async () => {
    await expect(
      payoutDestinationFor(db(standing()), profile),
    ).resolves.toEqual({ stripeConnectAccountId: 'acct_1' });
  });

  it.each([
    [
      'its person is banned from the whole account',
      standing({}, { isRootBanned: true }),
    ],
    ['its person is no longer active', standing({}, { isActive: false })],
    ['its person is being deleted', standing({}, { deletedAt: new Date() })],
    ['the Profile is banned', standing({ isAccountBanned: true })],
    [
      'the Profile is suspended for now',
      standing({ suspendedUntil: new Date(Date.now() + 60_000) }),
    ],
    ['the Profile is gone', null],
    [
      'its person is under 18',
      standing({}, { dateOfBirth: yearsAgo(MONETIZATION_MIN_AGE - 1) }),
    ],
    ['its person has no date of birth', standing({}, { dateOfBirth: null })],
    [
      'its person has no verified identity',
      standing({}, { identityVerifiedAt: null }),
    ],
    [
      'the Profile is not approved in the monetization programme',
      standing({ monetizationStatus: 'PENDING' }),
    ],
    [
      'the Profile’s approval was revoked',
      standing({ monetizationStatus: 'REVOKED' }),
    ],
    [
      'its date of birth was only typed at sign-up',
      standing({}, { dateOfBirthVerified: false }),
    ],
  ])('pays nothing when %s', async (_case, seller) => {
    const tx = db(seller);
    await expect(payoutDestinationFor(tx, profile)).rejects.toThrow(
      'Creator not found',
    );
    expect(tx.monetization.findUnique).not.toHaveBeenCalled();
  });

  it('pays a Profile whose suspension is over', async () => {
    const seller = standing({ suspendedUntil: new Date(Date.now() - 60_000) });
    await expect(
      payoutDestinationFor(db(seller), profile),
    ).resolves.toBeTruthy();
  });
});

describe('isOfChargingAge', () => {
  const verified = new Date('2026-01-01T00:00:00.000Z');

  it('lets a verified person charge from the day they turn 18', () => {
    const today = new Date();
    const birthday = new Date(
      today.getFullYear() - MONETIZATION_MIN_AGE,
      today.getMonth(),
      today.getDate(),
    );
    expect(
      isOfChargingAge({
        identityVerifiedAt: verified,
        dateOfBirth: birthday,
        dateOfBirthVerified: true,
      }),
    ).toBe(true);
    const dayBefore = new Date(birthday);
    dayBefore.setDate(dayBefore.getDate() + 1);
    expect(
      isOfChargingAge({
        identityVerifiedAt: verified,
        dateOfBirth: dayBefore,
        dateOfBirthVerified: true,
      }),
    ).toBe(false);
  });
});

describe('assertOfChargingAge', () => {
  const db = (user: object | null) =>
    ({ user: { findUnique: vi.fn().mockResolvedValue(user) } }) as any;

  it('lets an adult with a verified identity through', async () => {
    await expect(
      assertOfChargingAge(
        db({
          identityVerifiedAt: new Date(),
          dateOfBirth: yearsAgo(30),
          dateOfBirthVerified: true,
        }),
        'u1',
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      'under 18',
      {
        identityVerifiedAt: new Date(),
        dateOfBirth: yearsAgo(17),
        dateOfBirthVerified: true,
      },
    ],
    [
      'not verified',
      {
        identityVerifiedAt: null,
        dateOfBirth: yearsAgo(30),
        dateOfBirthVerified: false,
      },
    ],
    [
      'whose date of birth was only typed at sign-up',
      {
        identityVerifiedAt: new Date(),
        dateOfBirth: yearsAgo(30),
        dateOfBirthVerified: false,
      },
    ],
    ['gone', null],
  ])('refuses a person %s, saying the age', async (_case, user) => {
    await expect(assertOfChargingAge(db(user), 'u1')).rejects.toMatchObject({
      errorCode: ErrorCode.MONETIZATION_UNDER_AGE,
    });
  });
});

describe('assertMonetizationApproved', () => {
  const db = (profile: object | null) =>
    ({ profile: { findUnique: vi.fn().mockResolvedValue(profile) } }) as any;

  it('lets an approved Profile through', async () => {
    await expect(
      assertMonetizationApproved(db({ monetizationStatus: 'APPROVED' }), 'p1'),
    ).resolves.toBeUndefined();
  });

  it.each([
    ['pending', { monetizationStatus: 'PENDING' }, 'PENDING'],
    ['refused', { monetizationStatus: 'REJECTED' }, 'REJECTED'],
    ['gone', null, 'NONE'],
  ])(
    'refuses a Profile %s, saying where it stands',
    async (_c, profile, status) => {
      await expect(
        assertMonetizationApproved(db(profile), 'p1'),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.MONETIZATION_NOT_APPROVED,
        response: expect.objectContaining({ details: { status } }),
      });
    },
  );
});
