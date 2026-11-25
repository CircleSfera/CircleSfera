import { ErrorCode } from '@circlesfera/shared';
import { ForbiddenException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FREE_YEAR_CONSENT_VERSION } from '../common/consumer/withdrawal-consent.js';
import type { EmailService } from '../email/email.service.js';
import type { OutboxService } from '../outbox/outbox.service.js';
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
  const IP = '203.0.113.7';
  const seconds = (date: Date) => date.getTime() / 1000;
  const verified = {
    id: 'plan_verified',
    stripePriceId: 'price_verified_month',
    features: ['verified_badge'],
  };
  // The subscription the provider answers with: in trial until the year
  // ends, nothing charged, VAT worked out.
  const trialing = {
    id: 'sub_free',
    status: 'trialing',
    cancel_at_period_end: false,
    automatic_tax: { enabled: true },
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
  let email: { freeYearEndingMail: ReturnType<typeof vi.fn> };
  let events: { emit: ReturnType<typeof vi.fn> };
  let outbox: {
    enqueue: ReturnType<typeof vi.fn>;
    triggerImmediatePublish: ReturnType<typeof vi.fn>;
  };
  // The reminder email, as the email service answers it.
  const MAIL = { to: 'ana@example.com', subject: 's', html: 'h' };
  let service: PaymentsService;
  let warn: ReturnType<typeof vi.fn>;
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
            if (where.OR && data.freeYearAcceptedAt instanceof Date) {
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
            // The year written: the acceptance with it.
            if (data.platformSubscriptionId) {
              accepted = data.freeYearAcceptedAt;
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
      setCustomerTaxLocationFromIp: vi.fn().mockResolvedValue(undefined),
      assertPaymentsEnabled: vi.fn().mockResolvedValue(undefined),
      endDuplicateSubscription: vi.fn().mockResolvedValue({}),
      createFreeYearSubscription: vi.fn(
        async (params: { automaticTax: boolean; endAtTrialEnd: boolean }) => ({
          ...trialing,
          automatic_tax: { enabled: params.automaticTax },
          cancel_at_period_end: params.endAtTrialEnd,
        }),
      ),
      latestPaidInvoice: vi.fn(),
      refundSubscriptionPayment: vi.fn(),
      endSubscriptionNow: vi.fn().mockResolvedValue({}),
      cancelSubscription: vi.fn().mockResolvedValue({}),
      getSubscription: vi.fn(),
      resumeSubscription: vi.fn().mockResolvedValue({}),
    };
    users = { syncUserTier: vi.fn().mockResolvedValue(undefined) };
    email = { freeYearEndingMail: vi.fn().mockResolvedValue(MAIL) };
    events = { emit: vi.fn() };
    outbox = {
      enqueue: vi.fn().mockResolvedValue({}),
      triggerImmediatePublish: vi.fn(),
    };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      stripe as unknown as StripeService,
      email as unknown as EmailService,
      users as unknown as UsersService,
      {} as PaymentEventsService,
      events as never,
      undefined,
      outbox as unknown as OutboxService,
    );
    const logger = (
      service as unknown as {
        logger: { error: () => void; warn: () => void; log: () => void };
      }
    ).logger;
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'log').mockImplementation(() => {});
    warn = vi.fn();
    vi.spyOn(logger, 'warn').mockImplementation(warn as unknown as () => void);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (secretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = secretKey;
  });

  const start = (clientIp: string | null = IP) =>
    service.startFoundingYear({
      userId: 'u_1',
      profileId: 'prof_1',
      applicationId: 'app_1',
      clientIp,
    });
  const dispatch = (type: string, object: object) =>
    (
      service as unknown as {
        dispatchStripeEvent: (event: Stripe.Event) => Promise<void>;
      }
    ).dispatchStripeEvent({ type, data: { object } } as Stripe.Event);
  // What the transaction wrote on the application with the year.
  const linked = () =>
    prisma.foundingCreatorApplication.updateMany.mock.calls
      .map(([args]: [{ data: Record<string, unknown> }]) => args.data)
      .find((data: Record<string, unknown>) => data.platformSubscriptionId);

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
      // A customer the provider can already tax is not placed again.
      expect(stripe.setCustomerTaxLocationFromIp).not.toHaveBeenCalled();
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
      // Tied to its application in the same transaction, once, with the
      // acceptance it started from.
      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 'app_1', platformSubscriptionId: null },
          data: {
            platformSubscriptionId: 'row_1',
            freeYearTaxable: true,
            freeYearAcceptedAt: NOW,
            freeYearConsentVersion: FREE_YEAR_CONSENT_VERSION,
          },
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

    it('places a customer with no address by the IP address of the request, and the year goes on with VAT as the person accepted', async () => {
      stripe.canTaxCustomer
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await start();

      expect(stripe.setCustomerTaxLocationFromIp).toHaveBeenCalledWith(
        'cus_1',
        IP,
      );
      expect(stripe.createFreeYearSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ automaticTax: true, endAtTrialEnd: false }),
      );
      expect(linked()).toMatchObject({ freeYearTaxable: true });
      // The address is never written to the log.
      expect(JSON.stringify(warn.mock.calls)).not.toContain(IP);
    });

    it('ends the year at its end, with no charge possible, when the customer still cannot be taxed', async () => {
      stripe.canTaxCustomer.mockResolvedValue(false);

      await start();

      expect(stripe.setCustomerTaxLocationFromIp).toHaveBeenCalled();
      expect(stripe.createFreeYearSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ automaticTax: false, endAtTrialEnd: true }),
      );
      expect(linked()).toMatchObject({ freeYearTaxable: false });
    });

    it('ends the year at its end when the customer cannot be placed, never failing the start, and never logs the address', async () => {
      stripe.canTaxCustomer.mockResolvedValue(false);
      stripe.setCustomerTaxLocationFromIp.mockRejectedValue(
        new Error(`bad ip ${IP}`),
      );

      await start();

      expect(stripe.canTaxCustomer).toHaveBeenCalledTimes(1);
      expect(stripe.createFreeYearSubscription).toHaveBeenCalledWith(
        expect.objectContaining({ automaticTax: false, endAtTrialEnd: true }),
      );
      expect(warn).toHaveBeenCalledWith(
        'Customer cus_1 could not be placed for its VAT (transient)',
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(IP);
    });

    it('does not place a customer when the request has no IP address', async () => {
      stripe.canTaxCustomer.mockResolvedValue(false);

      await start(null);

      expect(stripe.setCustomerTaxLocationFromIp).not.toHaveBeenCalled();
      expect(linked()).toMatchObject({ freeYearTaxable: false });
    });

    it('keeps whether the year is taxed from the subscription the provider already held, not from the check of now', async () => {
      stripe.listSubscriptionsForCustomer.mockResolvedValue([
        {
          ...trialing,
          automatic_tax: { enabled: false },
          cancel_at_period_end: true,
        },
      ]);

      await start();

      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
      expect(linked()).toMatchObject({ freeYearTaxable: false });
    });

    it('asks the provider for the same year, under the same key, when a second start comes while the first is under way', async () => {
      // The first start waits at the provider after keeping its acceptance.
      let release = () => {};
      stripe.canTaxCustomer.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            release = () => resolve(true);
          }),
      );
      const first = start();
      await vi.waitFor(() => expect(stripe.canTaxCustomer).toHaveBeenCalled());
      const acceptedByFirst = accepted as unknown as Date;
      // The second one starts five seconds later, by its own clock.
      vi.setSystemTime(new Date(acceptedByFirst.getTime() + 5000));
      const second = start();
      await vi.waitFor(() =>
        expect(stripe.createFreeYearSubscription).toHaveBeenCalledTimes(1),
      );
      release();
      await Promise.all([first, second]);

      const [a, b] = stripe.createFreeYearSubscription.mock.calls.map(
        ([params]) => params,
      );
      // Both from the first acceptance: a key or a year from the clock of
      // each request would differ.
      expect(b).toEqual(a);
      const yearFromFirst = new Date(acceptedByFirst);
      yearFromFirst.setUTCFullYear(yearFromFirst.getUTCFullYear() + 1);
      expect(a.trialEnd).toEqual(yearFromFirst);
      expect(a.idempotencyKey).toBe(
        `founding_year_app_1_${acceptedByFirst.getTime()}`,
      );
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

    it('writes the acceptance again with the year, so a try at the same time that failed and let it go never leaves the year without it', async () => {
      // A failed try let go of the acceptance while this one was at the
      // provider.
      stripe.createFreeYearSubscription.mockImplementationOnce(
        async (params: { automaticTax: boolean }) => {
          accepted = null;
          return {
            ...trialing,
            automatic_tax: { enabled: params.automaticTax },
          };
        },
      );

      await start();

      expect(accepted).toEqual(NOW);
      expect(linked()).toMatchObject({
        freeYearAcceptedAt: NOW,
        freeYearConsentVersion: FREE_YEAR_CONSENT_VERSION,
      });
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

      await expect(start()).rejects.toThrow('provider down');
      expect(warn).toHaveBeenCalledWith(
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

      // The one-plan index refused it: told as a plan the Profile holds.
      await expect(start()).rejects.toMatchObject({
        errorCode: ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
      });
      expect(stripe.endSubscriptionNow).not.toHaveBeenCalled();
    });

    it('gives no year beside a plan the Profile came to hold during the start (a checkout that completed meanwhile), and ends the trial made', async () => {
      prisma.platformSubscription.count
        // None when the start began…
        .mockResolvedValueOnce(0)
        // …one, from the checkout, when the year is written.
        .mockResolvedValueOnce(1);

      await expect(start()).rejects.toMatchObject({
        errorCode: ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
      });
      expect(prisma.platformSubscription.count).toHaveBeenLastCalledWith({
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
          NOT: { stripeSubscriptionId: 'sub_free' },
        },
      });
      expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
      expect(stripe.endSubscriptionNow).toHaveBeenCalledWith('sub_free');
    });

    it('lets a checkout completing after the year started find it, and refunds that second plan, keeping the year', async () => {
      prisma.platformSubscription.findMany = vi
        .fn()
        .mockResolvedValue([{ stripeSubscriptionId: 'sub_free' }]);
      stripe.getSubscription.mockResolvedValue(trialing);
      stripe.latestPaidInvoice.mockResolvedValue(null);

      const refunded = await (
        service as unknown as {
          refundDuplicatePlan: (
            profileId: string,
            subscription: object,
            addOn: boolean,
          ) => Promise<boolean>;
        }
      ).refundDuplicatePlan(
        'prof_1',
        { id: 'sub_paid', status: 'active', metadata: {} },
        false,
      );

      expect(refunded).toBe(true);
      expect(stripe.endDuplicateSubscription).toHaveBeenCalledWith('sub_paid');
      expect(stripe.endSubscriptionNow).not.toHaveBeenCalledWith('sub_free');
    });

    it('is refused while payments are paused, before anything reaches the provider', async () => {
      stripe.assertPaymentsEnabled.mockRejectedValue(new Error('paused'));

      await expect(start()).rejects.toThrow('paused');
      expect(stripe.canTaxCustomer).not.toHaveBeenCalled();
      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
      expect(accepted).toBeNull();
    });

    it('lets one request at a time start the year: another meanwhile is told it is being started, with nothing done', async () => {
      prisma.foundingCreatorApplication.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 0 });

      await expect(start()).rejects.toMatchObject({
        errorCode: ErrorCode.FREE_YEAR_STARTING,
      });
      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: {
            id: 'app_1',
            platformSubscriptionId: null,
            OR: [
              { freeYearStartingUntil: null },
              { freeYearStartingUntil: { lt: NOW } },
            ],
          },
          data: { freeYearStartingUntil: new Date(NOW.getTime() + 300_000) },
        },
      );
      expect(stripe.canTaxCustomer).not.toHaveBeenCalled();
      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
    });

    it.each([
      ['it started', () => {}],
      [
        'it failed',
        () =>
          stripe.createFreeYearSubscription.mockRejectedValueOnce(
            new Error('down'),
          ),
      ],
    ])('lets go of the start once %s', async (_what, arrange) => {
      arrange();
      await start().catch(() => undefined);

      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: {
            id: 'app_1',
            freeYearStartingUntil: new Date(NOW.getTime() + 300_000),
          },
          data: { freeYearStartingUntil: null },
        },
      );
    });

    it('keeps the start, which lapses by itself, when it cannot be let go', async () => {
      const claim = prisma.foundingCreatorApplication.updateMany;
      prisma.foundingCreatorApplication.updateMany = vi.fn(
        (args: { data: Record<string, unknown> }) =>
          args.data.freeYearStartingUntil === null
            ? Promise.reject(new Error('db down'))
            : claim(args),
      );

      await expect(start()).resolves.toMatchObject({
        stripeSubscriptionId: 'sub_free',
      });
      expect(warn).toHaveBeenCalledWith(
        'The start of free year app_1 was not let go; it lapses by itself',
        expect.any(Error),
      );
    });

    it('keeps the acceptance a subscription made by an earlier try says, not this request’s', async () => {
      const earlier = '2026-11-25T09:00:00.000Z';
      stripe.listSubscriptionsForCustomer.mockResolvedValue([
        {
          ...trialing,
          metadata: {
            ...trialing.metadata,
            free_year_consent_at: earlier,
            free_year_consent_version: '2026-11-25',
          },
        },
      ]);

      await start();

      expect(linked()).toMatchObject({
        freeYearAcceptedAt: new Date(earlier),
        freeYearConsentVersion: '2026-11-25',
      });
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

    it('sets a free year without VAT to end again when the provider shows it going on (a cancellation taken back in the portal), and keeps its row ending', async () => {
      stripe.getSubscription.mockResolvedValue({
        ...trialing,
        automatic_tax: { enabled: false },
        cancel_at_period_end: false,
      });
      prisma.platformSubscription.findFirst
        .mockResolvedValueOnce({ id: 'row_1' })
        .mockResolvedValue({ userId: 'u_1' });

      await dispatch('customer.subscription.updated', { id: 'sub_free' });

      expect(prisma.platformSubscription.findFirst).toHaveBeenNthCalledWith(1, {
        where: { stripeSubscriptionId: 'sub_free', foundingCreatorYear: true },
        select: { id: true },
      });
      expect(stripe.cancelSubscription).toHaveBeenCalledWith('sub_free', true);
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancelAtPeriodEnd: true }),
        }),
      );
    });

    it('leaves any other subscription without VAT as the provider has it', async () => {
      stripe.getSubscription.mockResolvedValue({
        ...trialing,
        automatic_tax: { enabled: false },
      });
      prisma.platformSubscription.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ userId: 'u_1' });

      await dispatch('customer.subscription.updated', { id: 'sub_free' });

      expect(stripe.cancelSubscription).not.toHaveBeenCalled();
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancelAtPeriodEnd: false }),
        }),
      );
    });
  });

  describe('the reminder before it ends (customer.subscription.trial_will_end)', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'row_1',
      stripeSubscriptionId: 'sub_free',
      status: SubscriptionStatus.TRIALING,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: YEAR_END,
      periodPriceCents: 499,
      profileId: 'prof_1',
      user: { email: 'ana@example.com' },
      profile: { username: 'ana' },
      plan: { name: 'Verified', priceCents: 499, currency: 'EUR' },
      foundingCreatorApplication: { id: 'app_1' },
      ...over,
    });
    const remind = () =>
      dispatch('customer.subscription.trial_will_end', { id: 'sub_free' });
    const notice = (continues: boolean) => ({
      recipientId: 'prof_1',
      type: 'SYSTEM',
      notice: {
        key: 'free_year_ending',
        endsAt: YEAR_END,
        priceCents: 499,
        currency: 'EUR',
        continues,
      },
      targetType: 'platform_subscription',
      targetId: 'row_1',
    });

    it('tells the person once, in the app and by email, the day it ends and the price a saved card pays', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(row());

      await remind();

      expect(prisma.platformSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            stripeSubscriptionId: 'sub_free',
            foundingCreatorYear: true,
          },
        }),
      );
      // The email: built for the Profile whose year it is, and queued
      // through the outbox in the transaction that marks it sent, under a
      // job id of the application.
      expect(email.freeYearEndingMail).toHaveBeenCalledWith({
        email: 'ana@example.com',
        planName: 'Verified',
        username: 'ana',
        profileId: 'prof_1',
        endsAt: YEAR_END,
        priceCents: 499,
        currency: 'EUR',
        continues: true,
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 'app_1', freeYearReminderSentAt: null },
          data: { freeYearReminderSentAt: NOW },
        },
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, {
        queueName: 'email-processing',
        eventName: 'send-transactional-email',
        payload: MAIL,
        options: { jobId: 'free-year-ending-app_1' },
      });
      expect(outbox.triggerImmediatePublish).toHaveBeenCalled();
      // The notice in the app: marked on its own, then given.
      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 'app_1', freeYearNoticeSentAt: null },
          data: { freeYearNoticeSentAt: NOW },
        },
      );
      expect(events.emit).toHaveBeenCalledWith(
        'notification.create',
        notice(true),
      );
      expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('never tells twice: a notice that comes again, or at the same time, finds each way done', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(row());
      prisma.foundingCreatorApplication.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 0 });

      await remind();

      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('gives only what is missing when the notice comes again: the email queued, the notice in the app not yet', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(row());
      prisma.foundingCreatorApplication.updateMany = vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => ({
          count: 'freeYearReminderSentAt' in where ? 0 : 1,
        }),
      );

      await remind();

      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'notification.create',
        notice(true),
      );
    });

    it('fails the provider notice, with nothing marked, when the email cannot be queued, so it is sent again', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(row());
      outbox.enqueue.mockRejectedValueOnce(new Error('db down'));
      prisma.$transaction.mockImplementationOnce(
        async (work: (tx: unknown) => unknown) => {
          // The transaction is undone with the failure.
          await work(prisma);
        },
      );

      await expect(remind()).rejects.toThrow('db down');
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('tells a year set to end that it ends with nothing charged', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(
        row({ cancelAtPeriodEnd: true }),
      );

      await remind();

      expect(events.emit).toHaveBeenCalledWith(
        'notification.create',
        notice(false),
      );
      expect(email.freeYearEndingMail).toHaveBeenCalledWith(
        expect.objectContaining({ continues: false }),
      );
    });

    it('never switches a year set to end into one that charges, also when its customer could now be taxed and has a card', async () => {
      // Whatever the customer's address or card now: the year was set to
      // end, the person was told so, and it stays ending.
      prisma.platformSubscription.findFirst.mockResolvedValue(
        row({ cancelAtPeriodEnd: true }),
      );

      await remind();

      expect(stripe.canTaxCustomer).not.toHaveBeenCalled();
      expect(stripe.listSubscriptionsForCustomer).not.toHaveBeenCalled();
      expect(stripe.createFreeYearSubscription).not.toHaveBeenCalled();
      expect(stripe.resumeSubscription).not.toHaveBeenCalled();
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalled();
      // Only the reminder is marked, each way; nothing about the year
      // changes.
      expect(
        prisma.foundingCreatorApplication.updateMany.mock.calls.map(
          ([args]: [{ data: Record<string, unknown> }]) =>
            Object.keys(args.data),
        ),
      ).toEqual([['freeYearReminderSentAt'], ['freeYearNoticeSentAt']]);
      expect(events.emit).toHaveBeenCalledWith(
        'notification.create',
        notice(false),
      );
    });

    it('takes the price of the plan when the row has none, and tells by email when there is no Profile', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(
        row({ periodPriceCents: null, profileId: null, profile: null }),
      );

      await remind();

      expect(events.emit).not.toHaveBeenCalled();
      expect(email.freeYearEndingMail).toHaveBeenCalledWith({
        email: 'ana@example.com',
        planName: 'Verified',
        username: '',
        profileId: null,
        endsAt: YEAR_END,
        priceCents: 499,
        currency: 'EUR',
        continues: true,
      });
      expect(outbox.enqueue).toHaveBeenCalled();
    });

    it.each([
      ['another trial', null],
      ['a year with no application', row({ foundingCreatorApplication: null })],
      ['a year already ended', row({ status: SubscriptionStatus.CANCELLED })],
    ])('tells nobody about %s', async (_what, found) => {
      prisma.platformSubscription.findFirst.mockResolvedValue(found);

      await remind();

      expect(events.emit).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('gives the notice in the app alone when the account has no email', async () => {
      prisma.platformSubscription.findFirst.mockResolvedValue(
        row({ user: null }),
      );

      await remind();

      expect(email.freeYearEndingMail).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalled();
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

    it('offers no withdrawal on a free year, says it is one and whether it can go on past its end', async () => {
      prisma.platformSubscription.findFirst.mockImplementation(
        ({ where }: { where: { addOn: boolean } }) =>
          Promise.resolve(where.addOn ? null : freeRow),
      );
      prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([]);

      const res = await service.getBillingStatus('u_1', 'prof_1');

      expect(res.hasActiveSubscription).toBe(true);
      expect(res.subscription?.foundingCreatorYear).toBe(true);
      expect(res.subscription?.freeYearRenewable).toBe(true);
      expect(res.subscription?.withdrawableUntil).toBeNull();
      expect(res.subscription?.yearlyPriceCents).toBeNull();
      expect(stripe.getSubscription).not.toHaveBeenCalled();

      prisma.foundingCreatorApplication.findFirst.mockResolvedValue({
        freeYearTaxable: false,
      });
      const untaxed = await service.getBillingStatus('u_1', 'prof_1');
      expect(untaxed.subscription?.freeYearRenewable).toBe(false);
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
