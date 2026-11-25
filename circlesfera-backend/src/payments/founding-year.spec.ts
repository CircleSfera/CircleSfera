import { ErrorCode } from '@circlesfera/shared';
import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailService } from '../email/email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StripeService } from '../stripe/stripe.service.js';
import type { UsersService } from '../users/users.service.js';
import type { PaymentEventsService } from './payment-events.service.js';
import {
  FOUNDING_APPLICATION_METADATA_KEY,
  PaymentsService,
} from './payments.service.js';

// Whoever gets the year here is an adult with a verified identity, unless a
// test says otherwise; the rules are tested on their own
// (adult-payer.policy.spec.ts).
const adultPayer = vi.hoisted(() => ({
  assertAdultPayer: vi.fn(),
  assertIdentityForBadge: vi.fn(),
}));
vi.mock('../common/policies/adult-payer.policy.js', () => adultPayer);

// The free year of a founding creator (BD-034): the Verified plan given by
// the product for twelve months, as a trial at the provider with no payment
// method, kept in sync as any plan, and never withdrawn from nor refunded.
describe('PaymentsService: the free year of a founding creator', () => {
  const NOW = new Date('2026-11-25T10:00:00.000Z');
  const YEAR_END = new Date('2027-11-25T10:00:00.000Z');
  const seconds = (date: Date) => date.getTime() / 1000;
  const verified = {
    id: 'plan_verified',
    stripePriceId: 'price_verified_month',
    features: ['verified_badge'],
  };
  // The subscription the provider answers with: in trial until the year
  // ends, nothing charged.
  const trialing = {
    id: 'sub_free',
    status: 'trialing',
    cancel_at_period_end: false,
    start_date: seconds(NOW),
    metadata: { [FOUNDING_APPLICATION_METADATA_KEY]: 'app_1' },
    items: {
      data: [
        {
          current_period_start: seconds(NOW),
          current_period_end: seconds(YEAR_END),
          price: { unit_amount: 499, recurring: { interval: 'month' } },
        },
      ],
    },
  };

  let prisma: Record<string, any>;
  let stripe: Record<string, ReturnType<typeof vi.fn>>;
  let users: { syncUserTier: ReturnType<typeof vi.fn> };
  let service: PaymentsService;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // Where money is real, as in production.
    process.env.STRIPE_SECRET_KEY = 'sk_live_placeholder';
    adultPayer.assertAdultPayer.mockReset().mockResolvedValue(undefined);
    adultPayer.assertIdentityForBadge.mockReset().mockResolvedValue(undefined);
    prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u_1',
          email: 'ana@example.com',
          stripeCustomerId: 'cus_1',
          isTestAccount: false,
        }),
      },
      platformPlan: { findFirst: vi.fn().mockResolvedValue(verified) },
      platformSubscription: {
        count: vi.fn().mockResolvedValue(0),
        upsert: vi.fn().mockResolvedValue({ id: 'row_1' }),
        findFirst: vi.fn(),
      },
      foundingCreatorApplication: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn((work: (tx: unknown) => unknown) => work(prisma)),
    };
    stripe = {
      listSubscriptionsForCustomer: vi.fn().mockResolvedValue([]),
      createFreeYearSubscription: vi.fn().mockResolvedValue(trialing),
      latestPaidInvoice: vi.fn(),
      refundSubscriptionPayment: vi.fn(),
      endSubscriptionNow: vi.fn(),
      getSubscription: vi.fn(),
    };
    users = { syncUserTier: vi.fn().mockResolvedValue(undefined) };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      stripe as unknown as StripeService,
      {} as EmailService,
      users as unknown as UsersService,
      {} as PaymentEventsService,
      { emit: vi.fn() } as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    if (secretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = secretKey;
  });

  const start = () =>
    service.startFoundingYear({
      userId: 'u_1',
      profileId: 'prof_1',
      applicationId: 'app_1',
    });

  describe('startFoundingYear', () => {
    it('starts a trial of the Verified plan to twelve months from now, with no payment method, cancelled at its end without one, and writes it as any plan, marked free', async () => {
      const res = await start();

      // The Verified plan, told by what the catalog sets: on sale, for any
      // Profile, the Verified badge, the lowest price; never an add-on.
      expect(prisma.platformPlan.findFirst).toHaveBeenCalledWith({
        where: {
          isActive: true,
          addOn: false,
          badge: 'VERIFIED',
          forAccountType: null,
        },
        orderBy: { priceCents: 'asc' },
      });
      expect(stripe.createFreeYearSubscription).toHaveBeenCalledWith({
        customerId: 'cus_1',
        priceId: 'price_verified_month',
        trialEnd: YEAR_END,
        metadata: {
          userId: 'u_1',
          profileId: 'prof_1',
          planId: 'plan_verified',
          [FOUNDING_APPLICATION_METADATA_KEY]: 'app_1',
        },
        idempotencyKey: 'founding_year_app_1',
      });
      // The row every plan has, so its benefits, badge, cancelling and the
      // provider's notices (customer.subscription.updated / deleted) work
      // as for any plan.
      expect(prisma.platformSubscription.upsert).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_free' },
        update: {},
        create: {
          userId: 'u_1',
          planId: 'plan_verified',
          profileId: 'prof_1',
          status: SubscriptionStatus.TRIALING,
          stripeSubscriptionId: 'sub_free',
          currentPeriodStart: NOW,
          currentPeriodEnd: YEAR_END,
          cancelAtPeriodEnd: false,
          addOn: false,
          foundingCreatorYear: true,
          providerStartedAt: NOW,
          billingInterval: 'month',
          periodPriceCents: 499,
        },
        select: { id: true },
      });
      // Tied to its application in the same transaction, once.
      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 'app_1', platformSubscriptionId: null },
          data: { platformSubscriptionId: 'row_1' },
        },
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // The badge follows.
      expect(users.syncUserTier).toHaveBeenCalledWith('u_1');
      expect(res).toEqual({
        stripeSubscriptionId: 'sub_free',
        freeUntil: YEAR_END,
      });
      // No money moves.
      expect(stripe.refundSubscriptionPayment).not.toHaveBeenCalled();
    });

    it('makes the provider customer of the person when they have none yet', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u_1',
        email: 'ana@example.com',
        stripeCustomerId: null,
        isTestAccount: false,
      });
      stripe.createCustomer = vi.fn().mockResolvedValue({ id: 'cus_new' });
      prisma.user.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      await start();

      expect(stripe.createCustomer).toHaveBeenCalled();
      expect(stripe.createFreeYearSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cus_new' }),
      );
    });

    it('uses the subscription the provider already holds for the application, never a second one', async () => {
      stripe.listSubscriptionsForCustomer.mockResolvedValue([
        { ...trialing, id: 'sub_other', metadata: {} },
        {
          ...trialing,
          id: 'sub_ended',
          status: 'canceled',
        },
        trialing,
      ]);

      const res = await start();

      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
      expect(res.stripeSubscriptionId).toBe('sub_free');
      expect(prisma.platformSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_free' },
        }),
      );
    });

    it('gives no second plan to a Profile that already holds Verified or a higher plan', async () => {
      prisma.platformSubscription.count.mockResolvedValue(1);

      await expect(start()).rejects.toMatchObject({
        errorCode: ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
      });
      // Any plan it holds, running or owed; the add-on is not a plan.
      expect(prisma.platformSubscription.count).toHaveBeenCalledWith({
        where: {
          profileId: 'prof_1',
          addOn: false,
          status: {
            in: [
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.TRIALING,
              SubscriptionStatus.PAST_DUE,
              SubscriptionStatus.UNPAID,
            ],
          },
        },
      });
      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
      expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
    });

    it('does not start the year while the identity is not verified, as the badge needs (PD-076)', async () => {
      adultPayer.assertIdentityForBadge.mockRejectedValue(
        Object.assign(new Error('identity'), {
          errorCode: ErrorCode.IDENTITY_VERIFICATION_REQUIRED,
        }),
      );

      await expect(start()).rejects.toMatchObject({
        errorCode: ErrorCode.IDENTITY_VERIFICATION_REQUIRED,
      });
      expect(adultPayer.assertIdentityForBadge).toHaveBeenCalledWith(
        prisma,
        'u_1',
        ['verified_badge'],
      );
      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
    });

    it('gives none to whoever is not an adult payer: it can renew into a charge', async () => {
      adultPayer.assertAdultPayer.mockRejectedValue(new Error('under age'));

      await expect(start()).rejects.toThrow('under age');
      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
    });

    it('never gives one to a Test Account where money is real', async () => {
      prisma.user.findUnique.mockResolvedValue({ isTestAccount: true });

      await expect(start()).rejects.toBeInstanceOf(ForbiddenException);
      expect(stripe.listSubscriptionsForCustomer).not.toHaveBeenCalled();
      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
      expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
    });

    it('is refused when the Verified plan is not on sale', async () => {
      prisma.platformPlan.findFirst.mockResolvedValue(null);

      await expect(start()).rejects.toMatchObject({
        errorCode: ErrorCode.PLAN_NOT_FOUND,
      });
    });

    it('is refused when the account is gone', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ isTestAccount: false })
        .mockResolvedValueOnce(null);

      await expect(start()).rejects.toMatchObject({
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
    });
  });

  describe('no withdrawal and no refund on it', () => {
    const freeRow = {
      id: 'row_1',
      userId: 'u_1',
      planId: 'plan_verified',
      profileId: 'prof_1',
      stripeSubscriptionId: 'sub_free',
      status: SubscriptionStatus.TRIALING,
      foundingCreatorYear: true,
      createdAt: NOW,
      providerStartedAt: NOW,
      yearlyStartedAt: null,
      currentPeriodStart: NOW,
      currentPeriodEnd: YEAR_END,
      cancelAtPeriodEnd: false,
      billingInterval: 'month',
      periodPriceCents: 499,
      addOn: false,
      withdrawnAt: null,
      plan: {
        id: 'plan_verified',
        name: 'Verified',
        priceCents: 499,
        yearlyPriceCents: 4990,
        yearlyStripePriceId: 'price_verified_year',
        currency: 'EUR',
        features: ['verified_badge'],
      },
    };

    it('refuses to withdraw from a free year, with nothing done at the provider', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(freeRow);

      await expect(service.withdrawPlan('u_1', 'prof_1')).rejects.toMatchObject(
        { errorCode: ErrorCode.FREE_YEAR_NOT_WITHDRAWABLE },
      );
      expect(stripe.endSubscriptionNow).not.toHaveBeenCalled();
      expect(stripe.latestPaidInvoice).not.toHaveBeenCalled();
      expect(stripe.refundSubscriptionPayment).not.toHaveBeenCalled();
    });

    it('offers no withdrawal on a free year, and says it is one', async () => {
      prisma.platformSubscription.findFirst.mockImplementation(
        ({ where }: { where: { addOn: boolean } }) =>
          Promise.resolve(where.addOn ? null : freeRow),
      );
      prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([]);

      const res = await service.getBillingStatus('u_1', 'prof_1');

      expect(res.hasActiveSubscription).toBe(true);
      expect(res.subscription?.foundingCreatorYear).toBe(true);
      expect(res.subscription?.withdrawableUntil).toBeNull();
      // Not paid by the year either while free: the move charges.
      expect(res.subscription?.yearlyPriceCents).toBeNull();
      // Never read from the provider to work out a withdrawal.
      expect(stripe.getSubscription).not.toHaveBeenCalled();
    });
  });
});
