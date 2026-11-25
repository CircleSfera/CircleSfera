import { ErrorCode } from '@circlesfera/shared';
import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_YEAR_CONSENT_VERSION } from '../common/consumer/withdrawal-consent.js';
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

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('@sentry/nestjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nestjs')>()),
  captureException: sentry.captureException,
  captureMessage: sentry.captureMessage,
}));

// The free year of a founding creator (BD-034): the Verified plan given by
// the product for twelve months once the person accepts its terms, as a
// trial at the provider with VAT worked out; at its end it continues with a
// saved payment method and ends without one. Kept in sync as any plan, and
// never withdrawn from nor refunded.
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
  let email: { sendFreeYearEndingEmail: ReturnType<typeof vi.fn> };
  let events: { emit: ReturnType<typeof vi.fn> };
  let service: PaymentsService;
  // The acceptance kept on the application, as the database would.
  let accepted: Date | null;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // Where money is real, as in production.
    process.env.STRIPE_SECRET_KEY = 'sk_live_placeholder';
    sentry.captureMessage.mockClear();
    adultPayer.assertAdultPayer.mockReset().mockResolvedValue(undefined);
    adultPayer.assertIdentityForBadge.mockReset().mockResolvedValue(undefined);
    accepted = null;
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
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      foundingCreatorApplication: {
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: Record<string, any>;
            data: Record<string, any>;
          }) => {
            // The acceptance, kept once, or in place of one over an hour old.
            if (data.freeYearAcceptedAt instanceof Date) {
              const olderThan = where.OR[1].freeYearAcceptedAt.lt as Date;
              if (accepted && accepted >= olderThan) return { count: 0 };
              accepted = data.freeYearAcceptedAt;
              return { count: 1 };
            }
            // Let go of, when it is still the one of the failed try.
            if (data.freeYearAcceptedAt === null) {
              if (accepted?.getTime() !== where.freeYearAcceptedAt.getTime()) {
                return { count: 0 };
              }
              accepted = null;
              return { count: 1 };
            }
            return { count: 1 };
          },
        ),
        findFirst: vi.fn(async () => ({
          freeYearAcceptedAt: accepted,
          freeYearTaxable: true,
        })),
      },
      $transaction: vi.fn((work: (tx: unknown) => unknown) => work(prisma)),
    };
    stripe = {
      listSubscriptionsForCustomer: vi.fn().mockResolvedValue([]),
      canTaxCustomer: vi.fn().mockResolvedValue(true),
      createFreeYearSubscription: vi.fn().mockResolvedValue(trialing),
      latestPaidInvoice: vi.fn(),
      refundSubscriptionPayment: vi.fn(),
      endSubscriptionNow: vi.fn().mockResolvedValue({}),
      getSubscription: vi.fn(),
      resumeSubscription: vi.fn().mockResolvedValue({}),
    };
    users = { syncUserTier: vi.fn().mockResolvedValue(undefined) };
    email = { sendFreeYearEndingEmail: vi.fn().mockResolvedValue(undefined) };
    events = { emit: vi.fn() };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      stripe as unknown as StripeService,
      email as unknown as EmailService,
      users as unknown as UsersService,
      {} as PaymentEventsService,
      events as never,
    );
    vi.spyOn(
      (service as unknown as { logger: { error: () => void } }).logger,
      'error',
    ).mockImplementation(() => {});
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
  const dispatch = (type: string, object: object) =>
    (
      service as unknown as {
        dispatchStripeEvent: (event: Stripe.Event) => Promise<void>;
      }
    ).dispatchStripeEvent({ type, data: { object } } as Stripe.Event);

  describe('startFoundingYear', () => {
    it('starts a trial of the Verified plan to twelve months from the acceptance, VAT worked out, continuing with a saved payment method, with the terms accepted on it, and writes it as any plan, marked free', async () => {
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
      // The acceptance is kept on the application with the wording's
      // version.
      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            freeYearAcceptedAt: NOW,
            freeYearConsentVersion: FREE_YEAR_CONSENT_VERSION,
          },
        }),
      );
      expect(stripe.canTaxCustomer).toHaveBeenCalledWith('cus_1');
      expect(stripe.createFreeYearSubscription).toHaveBeenCalledWith({
        customerId: 'cus_1',
        priceId: 'price_verified_month',
        trialEnd: YEAR_END,
        automaticTax: true,
        // With a saved payment method it continues at the end of the year
        // (owner decision A); without one the provider ends it.
        endAtTrialEnd: false,
        metadata: {
          userId: 'u_1',
          profileId: 'prof_1',
          planId: 'plan_verified',
          [FOUNDING_APPLICATION_METADATA_KEY]: 'app_1',
          free_year_consent: 'accepted',
          free_year_consent_version: FREE_YEAR_CONSENT_VERSION,
          free_year_consent_at: NOW.toISOString(),
        },
        idempotencyKey: `founding_year_app_1_${NOW.getTime()}`,
      });
      // The row every plan has, so its benefits, badge, cancelling and the
      // provider's notices work as for any plan.
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
          data: { platformSubscriptionId: 'row_1', freeYearTaxable: true },
        },
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(users.syncUserTier).toHaveBeenCalledWith('u_1');
      expect(res).toEqual({
        stripeSubscriptionId: 'sub_free',
        freeUntil: YEAR_END,
      });
      expect(stripe.refundSubscriptionPayment).not.toHaveBeenCalled();
    });

    it('ends the year at its end, with no charge possible, when the provider cannot work out the VAT of the address', async () => {
      stripe.canTaxCustomer.mockResolvedValue(false);

      await start();

      expect(stripe.createFreeYearSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ automaticTax: false, endAtTrialEnd: true }),
      );
      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { platformSubscriptionId: 'row_1', freeYearTaxable: false },
        }),
      );
    });

    it('asks the provider for the same year, under the same key, when two starts run at once', async () => {
      await Promise.all([start(), start()]);

      const [a, b] = stripe.createFreeYearSubscription.mock.calls.map(
        ([params]) => params,
      );
      expect(b).toEqual(a);
    });

    it('counts the year from an acceptance made moments before by a request at the same time, never from its own clock', async () => {
      const earlier = new Date(NOW.getTime() - 10 * 60 * 1000);
      accepted = earlier;

      await start();

      const [params] = stripe.createFreeYearSubscription.mock.calls[0];
      const yearFromEarlier = new Date(earlier);
      yearFromEarlier.setUTCFullYear(yearFromEarlier.getUTCFullYear() + 1);
      expect(params.trialEnd).toEqual(yearFromEarlier);
      expect(params.idempotencyKey).toBe(
        `founding_year_app_1_${earlier.getTime()}`,
      );
      expect(params.metadata.free_year_consent_at).toBe(earlier.toISOString());
    });

    it('lets go of the acceptance when the provider refuses, so the next try uses a new key and a new year', async () => {
      stripe.createFreeYearSubscription.mockRejectedValueOnce(
        new Error('provider down'),
      );
      await expect(start()).rejects.toThrow('provider down');
      expect(accepted).toBeNull();

      vi.setSystemTime(new Date(NOW.getTime() + 60_000));
      await start();
      expect(
        stripe.createFreeYearSubscription.mock.calls[1][0].idempotencyKey,
      ).toBe(`founding_year_app_1_${NOW.getTime() + 60_000}`);
    });

    it('reports the provider refusal even when the acceptance cannot be let go', async () => {
      stripe.createFreeYearSubscription.mockRejectedValueOnce(
        new Error('provider down'),
      );
      const claim = prisma.foundingCreatorApplication.updateMany;
      prisma.foundingCreatorApplication.updateMany = vi.fn(
        (args: { data: Record<string, unknown> }) =>
          args.data.freeYearAcceptedAt === null
            ? Promise.reject(new Error('db down'))
            : claim(args),
      );
      const warned = vi
        .spyOn(
          (service as unknown as { logger: { warn: () => void } }).logger,
          'warn',
        )
        .mockImplementation(() => {});

      await expect(start()).rejects.toThrow('provider down');
      expect(warned).toHaveBeenCalledWith(
        'The acceptance of free year app_1 was not let go',
        expect.any(Error),
      );
    });

    it('replaces an acceptance of a try that never finished, over an hour old', async () => {
      accepted = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);

      await start();

      expect(
        stripe.createFreeYearSubscription.mock.calls[0][0].trialEnd,
      ).toEqual(YEAR_END);
    });

    it('ends the subscription at the provider when its row cannot be written, and says so', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

      await expect(start()).rejects.toThrow('db down');

      expect(stripe.endSubscriptionNow).toHaveBeenCalledWith('sub_free');
      expect(accepted).toBeNull();
      expect(users.syncUserTier).not.toHaveBeenCalled();
    });

    it('leaves the subscription when a request at the same time wrote its row', async () => {
      prisma.$transaction.mockRejectedValueOnce(
        Object.assign(new Error('unique'), { code: 'P2002' }),
      );
      prisma.platformSubscription.findFirst.mockResolvedValueOnce({
        id: 'row_1',
      });

      await expect(start()).rejects.toThrow('unique');
      expect(stripe.endSubscriptionNow).not.toHaveBeenCalled();
    });

    it('reports a subscription left without a row that could not be ended', async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
      stripe.endSubscriptionNow.mockRejectedValueOnce(new Error('down too'));

      await expect(start()).rejects.toThrow('db down');
      expect(sentry.captureMessage).toHaveBeenCalledWith(
        'Free year sub_free has no row and could not be ended at the provider',
        expect.objectContaining({ level: 'error' }),
      );
    });

    it('reports the start as done when the badge cannot be synced now', async () => {
      users.syncUserTier.mockRejectedValueOnce(new Error('cache down'));

      await expect(start()).resolves.toEqual({
        stripeSubscriptionId: 'sub_free',
        freeUntil: YEAR_END,
      });
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

      expect(stripe.createFreeYearSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cus_new' }),
      );
    });

    it('uses the subscription the provider already holds for the application, never a second one', async () => {
      stripe.listSubscriptionsForCustomer.mockResolvedValue([
        { ...trialing, id: 'sub_other', metadata: {} },
        { ...trialing, id: 'sub_ended', status: 'canceled' },
        trialing,
      ]);

      const res = await start();

      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
      expect(res.stripeSubscriptionId).toBe('sub_free');
    });

    it('gives no second plan to a Profile that already holds Verified or a higher plan', async () => {
      prisma.platformSubscription.count.mockResolvedValue(1);

      await expect(start()).rejects.toMatchObject({
        errorCode: ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
      });
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
      expect(accepted).toBeNull();
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

  describe('the end of the year, from the provider', () => {
    it('continues as a paid plan when a saved payment method paid its first month', async () => {
      stripe.getSubscription.mockResolvedValue({
        ...trialing,
        status: 'active',
      });
      prisma.platformSubscription.findFirst.mockResolvedValue({
        userId: 'u_1',
      });

      await dispatch('customer.subscription.updated', { id: 'sub_free' });

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
        }),
      );
      expect(users.syncUserTier).toHaveBeenCalledWith('u_1');
    });

    it('ends, with its badge, when the provider cancelled it for lack of a payment method', async () => {
      stripe.getSubscription.mockResolvedValue({
        ...trialing,
        status: 'canceled',
      });
      prisma.platformSubscription.findFirst.mockResolvedValue({
        userId: 'u_1',
      });

      await dispatch('customer.subscription.deleted', { id: 'sub_free' });

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SubscriptionStatus.CANCELLED,
          }),
        }),
      );
      expect(users.syncUserTier).toHaveBeenCalledWith('u_1');
    });
  });

  describe('the reminder before it ends (customer.subscription.trial_will_end)', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'row_1',
      status: SubscriptionStatus.TRIALING,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: YEAR_END,
      periodPriceCents: 499,
      profileId: 'prof_1',
      user: { email: 'ana@example.com' },
      profile: { username: 'ana' },
      plan: { name: 'Verified', priceCents: 499, currency: 'EUR' },
      ...over,
    });

    it('tells the person in the app and by email the day it ends and the price a saved card pays', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(row());

      await dispatch('customer.subscription.trial_will_end', {
        id: 'sub_free',
      });

      expect(prisma.platformSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            stripeSubscriptionId: 'sub_free',
            foundingCreatorYear: true,
          },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith('notification.create', {
        recipientId: 'prof_1',
        type: 'SYSTEM',
        notice: {
          key: 'free_year_ending',
          endsAt: YEAR_END,
          priceCents: 499,
          currency: 'EUR',
        },
        targetType: 'platform_subscription',
        targetId: 'row_1',
      });
      expect(email.sendFreeYearEndingEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Verified',
        'ana',
        YEAR_END,
        499,
        'EUR',
      );
      // A notice handled here: never reported as unknown.
      expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('takes the price of the plan when the row has none, and tells by email when there is no Profile', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(
        row({ periodPriceCents: null, profileId: null, profile: null }),
      );

      await dispatch('customer.subscription.trial_will_end', {
        id: 'sub_free',
      });

      expect(events.emit).not.toHaveBeenCalled();
      expect(email.sendFreeYearEndingEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Verified',
        '',
        YEAR_END,
        499,
        'EUR',
      );
    });

    it.each([
      ['another trial', null],
      ['a year cancelled', row({ cancelAtPeriodEnd: true })],
      ['a year already ended', row({ status: SubscriptionStatus.CANCELLED })],
    ])('tells nobody about %s', async (_what, found) => {
      prisma.platformSubscription.findFirst.mockResolvedValue(found);

      await dispatch('customer.subscription.trial_will_end', {
        id: 'sub_free',
      });

      expect(events.emit).not.toHaveBeenCalled();
      expect(email.sendFreeYearEndingEmail).not.toHaveBeenCalled();
      expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('does not fail the notice when the email cannot be sent', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(
        row({ user: null }),
      );
      await dispatch('customer.subscription.trial_will_end', {
        id: 'sub_free',
      });
      expect(email.sendFreeYearEndingEmail).not.toHaveBeenCalled();

      prisma.platformSubscription.findFirst.mockResolvedValue(row());
      email.sendFreeYearEndingEmail.mockRejectedValueOnce(new Error('smtp'));
      await expect(
        dispatch('customer.subscription.trial_will_end', { id: 'sub_free' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('no withdrawal, no refund, no charge without VAT', () => {
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
      profile: { username: 'ana' },
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
      expect(res.subscription?.yearlyPriceCents).toBeNull();
      expect(stripe.getSubscription).not.toHaveBeenCalled();
    });

    it('never resumes into a charge a free year whose VAT cannot be worked out', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue({
        ...freeRow,
        cancelAtPeriodEnd: true,
      });
      prisma.foundingCreatorApplication.findFirst.mockResolvedValue({
        freeYearTaxable: false,
      });

      await expect(service.resumePlan('u_1', 'prof_1')).rejects.toMatchObject({
        errorCode: ErrorCode.FREE_YEAR_NOT_RENEWABLE,
      });
      expect(prisma.foundingCreatorApplication.findFirst).toHaveBeenCalledWith({
        where: { platformSubscriptionId: 'row_1' },
        select: { freeYearTaxable: true },
      });
      expect(stripe.resumeSubscription).not.toHaveBeenCalled();
    });

    it('resumes a free year cancelled by the person when its VAT can be worked out', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue({
        ...freeRow,
        cancelAtPeriodEnd: true,
      });
      prisma.platformSubscription.updateMany.mockResolvedValue({ count: 0 });
      prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([]);

      await service.resumePlan('u_1', 'prof_1');

      expect(stripe.resumeSubscription).toHaveBeenCalledWith('sub_free');
    });
  });
});
