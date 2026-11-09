import { ErrorCode } from '@circlesfera/shared';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instantPayoutFeeCents } from '../common/constants/monetization.constants.js';
import type { StripeService } from '../common/stripe/stripe.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { InstantPayoutService } from './instant-payout.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const USER = 'user-1';
const PROFILE = 'profile-1';
const ACCOUNT = 'acct_1';

function makePrisma() {
  return {
    monetization: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ stripeConnectAccountId: ACCOUNT }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ isTestAccount: false }),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue({
        userId: USER,
        isAccountBanned: false,
        suspendedUntil: null,
        user: { isActive: true, isRootBanned: false, deletedAt: null },
      }),
    },
    // Sales of the Profile: the first 120 days ago, 12 of them.
    $queryRaw: vi
      .fn()
      .mockResolvedValue([
        { firstSale: new Date(Date.now() - 120 * DAY_MS), count: 12 },
      ]),
    paymentDispute: {
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

function makeStripe() {
  return {
    getAccount: vi.fn().mockResolvedValue({
      payouts_enabled: true,
      default_currency: 'eur',
      settings: { payouts: { schedule: { interval: 'weekly' } } },
    }),
    // €100 instant; 1.5% is €1.50, so €98.50 reaches the bank.
    getInstantPayoutBalance: vi.fn().mockResolvedValue([
      {
        currency: 'eur',
        amountCents: 10_000,
        net: [{ destination: 'ba_1', amountCents: 9_850 }],
      },
    ]),
    createInstantPayout: vi.fn().mockResolvedValue({
      id: 'po_1',
      amount: 9_850,
      currency: 'eur',
      arrival_date: 1_800_000_000,
    }),
  };
}

describe('instantPayoutFeeCents', () => {
  it('is 1.5% rounded up, never under €0.50', () => {
    expect(instantPayoutFeeCents(10_000)).toBe(150);
    expect(instantPayoutFeeCents(10_001)).toBe(151);
    expect(instantPayoutFeeCents(1_000)).toBe(50);
    expect(instantPayoutFeeCents(3_333)).toBe(50);
    expect(instantPayoutFeeCents(3_334)).toBe(51);
  });
});

describe('InstantPayoutService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let stripe: ReturnType<typeof makeStripe>;
  let service: InstantPayoutService;

  beforeEach(() => {
    prisma = makePrisma();
    stripe = makeStripe();
    service = new InstantPayoutService(
      prisma as unknown as PrismaService,
      stripe as unknown as StripeService,
    );
  });

  describe('getOffer', () => {
    it('offers the balance, the fee and what reaches the bank to a Profile with a track record', async () => {
      const offer = await service.getOffer(USER, PROFILE);
      expect(offer).toMatchObject({
        available: true,
        reason: null,
        quote: {
          currency: 'EUR',
          amountCents: 10_000,
          feeCents: 150,
          netCents: 9_850,
        },
        trackRecord: { daysSinceFirstSale: 120, sales: 12 },
      });
      expect(prisma.monetization.findUnique).toHaveBeenCalledWith({
        where: { profileId: PROFILE },
        select: { stripeConnectAccountId: true },
      });
    });

    it('offers nothing to a Profile without a payout account of its own', async () => {
      prisma.monetization.findUnique.mockResolvedValue(null);
      const offer = await service.getOffer(USER, PROFILE);
      expect(offer).toMatchObject({ available: false, reason: 'NO_ACCOUNT' });
      expect(stripe.getAccount).not.toHaveBeenCalled();
    });

    it('offers nothing before 90 days since the first sale', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { firstSale: new Date(Date.now() - 89 * DAY_MS), count: 50 },
      ]);
      const offer = await service.getOffer(USER, PROFILE);
      expect(offer).toMatchObject({
        available: false,
        reason: 'TRACK_RECORD',
        trackRecord: { daysSinceFirstSale: 89, minDaysSinceFirstSale: 90 },
      });
      expect(stripe.getInstantPayoutBalance).not.toHaveBeenCalled();
    });

    it('offers nothing with fewer than 10 sales, or none', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { firstSale: new Date(Date.now() - 200 * DAY_MS), count: 9 },
      ]);
      expect((await service.getOffer(USER, PROFILE)).reason).toBe(
        'TRACK_RECORD',
      );
      prisma.$queryRaw.mockResolvedValue([{ firstSale: null, count: 0 }]);
      const offer = await service.getOffer(USER, PROFILE);
      expect(offer.reason).toBe('TRACK_RECORD');
      expect(offer.trackRecord?.daysSinceFirstSale).toBeNull();
    });

    it('offers nothing after a dispute in the last 180 days, an inquiry aside', async () => {
      prisma.paymentDispute.count.mockImplementation(async (args) =>
        args.where.openedAt ? 1 : 0,
      );
      const offer = await service.getOffer(USER, PROFILE);
      expect(offer).toMatchObject({
        available: false,
        reason: 'TRACK_RECORD',
        trackRecord: { disputedRecently: true },
      });
      const recent = prisma.paymentDispute.count.mock.calls.find(
        ([args]) => args.where.openedAt,
      )?.[0];
      expect(recent.where.NOT).toEqual({
        status: { startsWith: 'warning_' },
      });
      expect(recent.where.transaction).toEqual({
        receiverProfileId: PROFILE,
      });
      expect(
        Date.now() - recent.where.openedAt.gte.getTime(),
      ).toBeGreaterThanOrEqual(180 * DAY_MS - 1000);
    });

    it('offers nothing while a dispute of a payment the person received is open', async () => {
      prisma.paymentDispute.count.mockImplementation(async (args) =>
        args.where.status ? 1 : 0,
      );
      const offer = await service.getOffer(USER, PROFILE);
      expect(offer).toMatchObject({ available: false, reason: 'DISPUTE_OPEN' });
      const open = prisma.paymentDispute.count.mock.calls.find(
        ([args]) => args.where.status,
      )?.[0];
      expect(open.where).toEqual({
        status: { notIn: ['won', 'lost', 'warning_closed'] },
        transaction: { receiverId: USER },
      });
    });

    it.each([
      ['a banned Profile', { isAccountBanned: true }],
      [
        'a suspended Profile',
        { suspendedUntil: new Date(Date.now() + DAY_MS) },
      ],
      [
        'a person banned from the whole account',
        {
          user: { isActive: true, isRootBanned: true, deletedAt: null },
        },
      ],
      [
        'a deactivated person',
        {
          user: { isActive: false, isRootBanned: false, deletedAt: null },
        },
      ],
      ["another person's Profile", { userId: 'someone-else' }],
    ])('offers nothing to %s', async (_label, change) => {
      prisma.profile.findUnique.mockResolvedValue({
        userId: USER,
        isAccountBanned: false,
        suspendedUntil: null,
        user: { isActive: true, isRootBanned: false, deletedAt: null },
        ...change,
      });
      const offer = await service.getOffer(USER, PROFILE);
      expect(offer).toMatchObject({ available: false, reason: 'RESTRICTED' });
      expect(stripe.getInstantPayoutBalance).not.toHaveBeenCalled();
    });

    it('offers nothing while the payouts of the account are held or disabled', async () => {
      stripe.getAccount.mockResolvedValue({
        payouts_enabled: true,
        settings: { payouts: { schedule: { interval: 'manual' } } },
      });
      expect((await service.getOffer(USER, PROFILE)).reason).toBe('RESTRICTED');
      stripe.getAccount.mockResolvedValue({
        payouts_enabled: false,
        settings: { payouts: { schedule: { interval: 'weekly' } } },
      });
      expect((await service.getOffer(USER, PROFILE)).reason).toBe('RESTRICTED');
    });

    it('offers nothing when no instant balance reaches a bank', async () => {
      stripe.getInstantPayoutBalance.mockResolvedValue([
        { currency: 'eur', amountCents: 0, net: [] },
      ]);
      expect((await service.getOffer(USER, PROFILE)).reason).toBe('NO_BALANCE');
    });

    it("offers nothing while the provider's fee is below CircleSfera's price", async () => {
      // No platform pricing set: the whole balance would reach the bank.
      stripe.getInstantPayoutBalance.mockResolvedValue([
        {
          currency: 'eur',
          amountCents: 10_000,
          net: [{ destination: 'ba_1', amountCents: 10_000 }],
        },
      ]);
      expect((await service.getOffer(USER, PROFILE)).reason).toBe(
        'UNAVAILABLE',
      );
    });

    it('accepts a provider fee one cent off by rounding', async () => {
      stripe.getInstantPayoutBalance.mockResolvedValue([
        {
          currency: 'eur',
          amountCents: 10_001,
          net: [{ destination: 'ba_1', amountCents: 9_851 }],
        },
      ]);
      const offer = await service.getOffer(USER, PROFILE);
      expect(offer.quote).toMatchObject({ feeCents: 150, netCents: 9_851 });
    });

    it('offers nothing when the provider cannot be read', async () => {
      stripe.getAccount.mockRejectedValue(new Error('down'));
      expect((await service.getOffer(USER, PROFILE)).reason).toBe(
        'UNAVAILABLE',
      );
    });

    it('pays to the bank account or card that receives the most', async () => {
      stripe.getInstantPayoutBalance.mockResolvedValue([
        {
          currency: 'eur',
          amountCents: 10_000,
          net: [
            { destination: 'card_1', amountCents: 9_800 },
            { destination: 'ba_1', amountCents: 9_850 },
          ],
        },
      ]);
      await service.payOut(USER, PROFILE, {
        netCents: 9_850,
        idempotencyKey: 'k1',
      });
      expect(stripe.createInstantPayout).toHaveBeenCalledWith(
        ACCOUNT,
        expect.objectContaining({ destination: 'ba_1' }),
      );
    });
  });

  describe('payOut', () => {
    it('asks the provider for an instant payout of what reaches the bank', async () => {
      const result = await service.payOut(USER, PROFILE, {
        netCents: 9_850,
        idempotencyKey: 'confirm-1',
      });
      expect(stripe.createInstantPayout).toHaveBeenCalledWith(ACCOUNT, {
        amountCents: 9_850,
        currency: 'eur',
        destination: 'ba_1',
        idempotencyKey: `instant-payout:${ACCOUNT}:confirm-1`,
      });
      expect(result).toEqual({
        currency: 'EUR',
        netCents: 9_850,
        arrivalDate: new Date(1_800_000_000 * 1000).toISOString(),
      });
    });

    it('checks every rule again before paying out', async () => {
      prisma.profile.findUnique.mockResolvedValue({
        userId: USER,
        isAccountBanned: true,
        suspendedUntil: null,
        user: { isActive: true, isRootBanned: false, deletedAt: null },
      });
      await expect(
        service.payOut(USER, PROFILE, { netCents: 9_850, idempotencyKey: 'k' }),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.INSTANT_PAYOUT_NOT_AVAILABLE,
      });
      expect(stripe.createInstantPayout).not.toHaveBeenCalled();
    });

    it('refuses an amount other than the one it would pay now', async () => {
      await expect(
        service.payOut(USER, PROFILE, {
          netCents: 20_000,
          idempotencyKey: 'k',
        }),
      ).rejects.toMatchObject({
        status: 409,
        errorCode: ErrorCode.INSTANT_PAYOUT_AMOUNT_CHANGED,
      });
      expect(stripe.createInstantPayout).not.toHaveBeenCalled();
    });

    it('refuses a Test Account where money is real', async () => {
      const key = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = 'sk_live_x';
      prisma.user.findUnique.mockResolvedValue({ isTestAccount: true });
      try {
        await expect(
          service.payOut(USER, PROFILE, {
            netCents: 9_850,
            idempotencyKey: 'k',
          }),
        ).rejects.toMatchObject({
          errorCode: ErrorCode.INSTANT_PAYOUT_NOT_AVAILABLE,
        });
      } finally {
        process.env.STRIPE_SECRET_KEY = key;
      }
      expect(stripe.createInstantPayout).not.toHaveBeenCalled();
    });

    it('answers a payout the provider refuses as not available', async () => {
      stripe.createInstantPayout.mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          type: 'invalid_request_error',
          message: 'Insufficient funds',
          code: 'balance_insufficient',
        }),
      );
      await expect(
        service.payOut(USER, PROFILE, { netCents: 9_850, idempotencyKey: 'k' }),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.INSTANT_PAYOUT_NOT_AVAILABLE,
      });
    });

    it('lets any other failure of the provider through', async () => {
      const down = new Error('network');
      stripe.createInstantPayout.mockRejectedValue(down);
      await expect(
        service.payOut(USER, PROFILE, { netCents: 9_850, idempotencyKey: 'k' }),
      ).rejects.toBe(down);
    });
  });
});
