import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StripeService } from '../stripe/stripe.service.js';
import { UsersService } from '../users/users.service.js';
import { PaymentEventsService } from './payment-events.service.js';
import {
  PaymentsService,
  planAccountType,
  unusedPartCents,
} from './payments.service.js';

// Whoever pays here is an adult with a verified identity, unless a test says
// otherwise; the rules are tested on their own (adult-payer.policy.spec.ts).
const adultPayer = vi.hoisted(() => ({
  assertAdultPayer: vi.fn().mockResolvedValue(undefined),
  assertIdentityForBadge: vi.fn().mockResolvedValue(undefined),
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

const asEvent = (event: unknown) => event as unknown as Stripe.Event;

// Where a notice writes a subscription's state: never over a row moved to
// the yearly price after the period the notice names started.
const written = (stripeSubscriptionId: string) => ({
  stripeSubscriptionId,
  OR: [
    { yearlyStartedAt: null },
    { yearlyStartedAt: { lte: expect.any(Date) } },
  ],
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let emailService: any;
  let stripeService: any;
  let usersService: any;
  let paymentEvents: {
    handleCheckoutSessionCompleted: ReturnType<typeof vi.fn>;
    handleCheckoutSessionExpired: ReturnType<typeof vi.fn>;
    handleChargeRefunded: ReturnType<typeof vi.fn>;
    applyDisputeToPayment: ReturnType<typeof vi.fn>;
    syncDispute: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            webhookEvent: {
              findUnique: vi.fn(),
              findMany: vi.fn().mockResolvedValue([]),
              create: vi.fn().mockResolvedValue({}),
              upsert: vi.fn().mockResolvedValue({}),
              update: vi.fn().mockResolvedValue({}),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            transaction: {
              create: vi.fn(),
              findUnique: vi.fn(),
              findMany: vi.fn().mockResolvedValue([]),
              update: vi.fn(),
            },
            promotion: { update: vi.fn(), updateMany: vi.fn() },
            platformSubscription: {
              upsert: vi.fn(),
              updateMany: vi.fn(),
              findFirst: vi.fn(),
              findMany: vi.fn().mockResolvedValue([]),
              update: vi.fn(),
              count: vi.fn().mockResolvedValue(0),
            },
            creatorSubscription: {
              updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
            platformPlan: {
              findUnique: vi.fn(),
              findFirst: vi.fn(),
              findMany: vi.fn().mockResolvedValue([]),
            },
            user: {
              update: vi.fn(),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
              findUnique: vi.fn(),
              findFirst: vi.fn(),
            },
            profile: {
              findFirst: vi
                .fn()
                .mockResolvedValue({ id: 'prof_1', accountType: 'PERSONAL' }),
            },
            $transaction: vi.fn((callback) => callback(prisma)),
          },
        },
        {
          provide: StripeService,
          useValue: {
            getSubscription: vi.fn(),
            getChargeCustomerId: vi.fn(),
            cancelSubscription: vi.fn().mockResolvedValue(undefined),
            resumeSubscription: vi.fn().mockResolvedValue(undefined),
            createCustomer: vi.fn(),
            assertPaymentsEnabled: vi.fn().mockResolvedValue(undefined),
            createCheckoutSession: vi.fn(),
            listOpenCheckoutSessions: vi.fn().mockResolvedValue([]),
            expireCheckoutSession: vi.fn().mockResolvedValue(undefined),
            endSubscriptionNow: vi.fn().mockResolvedValue(undefined),
            latestPaidInvoice: vi.fn().mockResolvedValue(null),
            refundSubscriptionPayment: vi.fn().mockResolvedValue(null),
            createPortalSession: vi.fn(),
            constructEvent: vi.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: vi.fn() },
        },
        {
          provide: EmailService,
          useValue: {
            sendSubscriptionStartedEmail: vi.fn(),
            sendSubscriptionReceipt: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UsersService,
          useValue: {
            handleIdentityWebhook: vi.fn(),
            syncUserTier: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('http://localhost:5173'),
          },
        },
        {
          provide: PaymentEventsService,
          useValue: {
            handleCheckoutSessionCompleted: vi
              .fn()
              .mockResolvedValue(undefined),
            handleCheckoutSessionExpired: vi.fn().mockResolvedValue(undefined),
            handleChargeRefunded: vi.fn().mockResolvedValue(undefined),
            applyDisputeToPayment: vi.fn().mockResolvedValue(undefined),
            syncDispute: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get(EventEmitter2);
    emailService = module.get<EmailService>(EmailService);
    stripeService = module.get<StripeService>(StripeService);
    usersService = module.get<UsersService>(UsersService);
    paymentEvents = module.get(PaymentEventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('mapStripeStatus', () => {
    it('maps all standard and edge stripe statuses correctly', () => {
      const map = (status: string) => (service as any).mapStripeStatus(status);
      expect(map('active')).toBe(SubscriptionStatus.ACTIVE);
      expect(map('trialing')).toBe(SubscriptionStatus.TRIALING);
      expect(map('past_due')).toBe(SubscriptionStatus.PAST_DUE);
      expect(map('unpaid')).toBe(SubscriptionStatus.PAST_DUE);
      expect(map('incomplete')).toBe(SubscriptionStatus.INCOMPLETE);
      expect(map('incomplete_expired')).toBe(SubscriptionStatus.EXPIRED);
      expect(map('canceled')).toBe(SubscriptionStatus.CANCELLED);
      expect(map('unknown_status')).toBe(SubscriptionStatus.PAST_DUE);
    });
  });

  describe('getLedgerCsv', () => {
    const tx = (over: object) => ({
      id: 'tx_1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      type: 'PROMOTION_PAYMENT',
      amount: 500,
      currency: 'EUR',
      status: 'COMPLETED',
      senderId: 'user_1',
      description: 'A "special" promotion',
      // 5 € plus 21% VAT.
      vatCents: 105,
      refundedCents: 0,
      ...over,
    });

    it('gives a person what they paid, refunds included, in euros', async () => {
      prisma.transaction.findMany = vi.fn().mockResolvedValue([
        tx({}),
        tx({
          id: 'tx_2',
          type: 'STRIPE_SUBSCRIPTION',
          amount: 1999,
          vatCents: 0,
          refundedCents: 999,
          description: null,
        }),
        tx({
          id: 'tx_3',
          amount: -500,
          vatCents: 0,
          status: 'REFUNDED',
          description: null,
        }),
      ]);

      const csv = await service.getLedgerCsv('user_1');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { senderId: 'user_1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(csv.split('\n')).toEqual([
        'ID,Date,Type,Direction,Amount,VAT,Refunded,Currency,Status,Description',
        '"tx_1","2026-01-01T00:00:00.000Z","PROMOTION_PAYMENT","SENT","5.00","1.05","0.00","EUR","COMPLETED","A ""special"" promotion"',
        '"tx_2","2026-01-01T00:00:00.000Z","STRIPE_SUBSCRIPTION","SENT","19.99","0.00","9.99","EUR","COMPLETED",""',
        '"tx_3","2026-01-01T00:00:00.000Z","PROMOTION_PAYMENT","REFUND","-5.00","0.00","0.00","EUR","REFUNDED",""',
      ]);
    });

    it("never names the other party in a person's own record", async () => {
      prisma.transaction.findMany = vi
        .fn()
        .mockResolvedValue([tx({ sender: { email: 'sender@test.com' } })]);

      const csv = await service.getLedgerCsv('user_1');

      expect(csv).not.toContain('@test.com');
      expect(csv).not.toContain('user_2');
    });

    it('gives staff every transaction with who paid it, in euros', async () => {
      prisma.transaction.findMany = vi.fn().mockResolvedValue([
        tx({ sender: { email: 'sender@test.com' } }),
        tx({
          id: 'tx_2',
          type: 'PROMOTION_PAYMENT',
          amount: 1000,
          vatCents: 0,
          sender: null,
          description: null,
        }),
      ]);

      const csv = await service.getLedgerCsv();

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: { email: true } },
        },
      });
      expect(csv.split('\n')).toEqual([
        'ID,Date,Type,Amount,VAT,Refunded,Currency,Status,Sender,Description',
        '"tx_1","2026-01-01T00:00:00.000Z","PROMOTION_PAYMENT","5.00","1.05","0.00","EUR","COMPLETED","sender@test.com","A ""special"" promotion"',
        '"tx_2","2026-01-01T00:00:00.000Z","PROMOTION_PAYMENT","10.00","0.00","0.00","EUR","COMPLETED","SYSTEM",""',
      ]);
    });

    it.each([
      '=HYPERLINK("x")',
      '+1',
      '-1',
      '@SUM(A1)',
      '\tlead',
      '\rlead',
      '\nlead',
    ])(
      'writes a text that starts like a formula (%s) as text',
      async (text) => {
        prisma.transaction.findMany = vi
          .fn()
          .mockResolvedValue([
            tx({ description: text, sender: { email: text } }),
          ]);

        // Whole files: a text may hold a line break of its own.
        const own = await service.getLedgerCsv('user_1');
        const staff = await service.getLedgerCsv();

        const quoted = `"'${text.replace(/"/g, '""')}"`;
        expect(own.endsWith(`"COMPLETED",${quoted}`)).toBe(true);
        expect(staff).toContain(`"COMPLETED",${quoted},${quoted}`);
      },
    );
  });

  describe('findAllPlans', () => {
    it('queries active platform plans ordered by priceCents asc', async () => {
      prisma.platformPlan.findMany = vi.fn().mockResolvedValue([
        { id: 'p1', name: 'Starter', priceCents: 1000, isActive: true },
        { id: 'p2', name: 'Pro', priceCents: 2500, isActive: true },
      ]);

      const plans = await service.findAllPlans();
      expect(plans).toHaveLength(2);
      expect(prisma.platformPlan.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { priceCents: 'asc' },
      });
    });
  });

  describe('createCheckout and ensureStripeCustomer', () => {
    it('opens no plan checkout when whoever pays is not an adult', async () => {
      adultPayer.assertAdultPayer.mockRejectedValueOnce(
        Object.assign(new Error('under age'), { errorCode: 'PAYER_UNDER_AGE' }),
      );
      await expect(
        service.createCheckout('u_1', 'plan_1', 'MONTHLY', 'prof_1'),
      ).rejects.toMatchObject({ errorCode: 'PAYER_UNDER_AGE' });
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('opens no checkout of a plan with the badge without a verified identity', async () => {
      adultPayer.assertIdentityForBadge.mockRejectedValueOnce(
        Object.assign(new Error('no identity'), {
          errorCode: 'IDENTITY_VERIFICATION_REQUIRED',
        }),
      );
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        email: 'u@example.com',
        stripeCustomerId: 'cus_1',
        platformSubscriptions: [],
      });
      prisma.profile.findFirst = vi
        .fn()
        .mockResolvedValue({ id: 'prof_1', accountType: 'PERSONAL' });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        id: 'plan_1',
        name: 'Verified',
        stripePriceId: 'price_m',
        features: ['verified_badge'],
      });
      await expect(
        service.createCheckout('u_1', 'plan_1', 'MONTHLY', 'prof_1'),
      ).rejects.toMatchObject({ errorCode: 'IDENTITY_VERIFICATION_REQUIRED' });
      expect(adultPayer.assertIdentityForBadge).toHaveBeenCalledWith(
        expect.anything(),
        'u_1',
        ['verified_badge'],
      );
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('throws USER_NOT_FOUND when user does not exist', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue(null);
      await expect(
        service.createCheckout('u_none', 'plan_1', 'MONTHLY', 'prof_1'),
      ).rejects.toThrow('User not found');
    });

    it('throws PLAN_NOT_FOUND when plan does not exist', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        service.createCheckout('u_1', 'plan_none', 'MONTHLY', 'prof_1'),
      ).rejects.toThrow('Plan not found');
    });

    it('only looks for the plan among the ones on sale', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        service.createCheckout('u_1', 'plan_off_sale', 'MONTHLY', 'prof_1'),
      ).rejects.toThrow('Plan not found');

      expect(prisma.platformPlan.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ isActive: true }),
      });
    });

    it('throws BadRequest ACTIVE_SUBSCRIPTION_EXISTS when already subscribed to the same plan', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        platformSubscriptions: [
          {
            planId: 'plan_1',
            plan: { name: 'Premium', features: [] },
            profileId: 'prof_1',
            status: SubscriptionStatus.ACTIVE,
          },
        ],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        features: [],
        id: 'plan_1',
        stripePriceId: 'price_monthly',
      });

      await expect(
        service.createCheckout('u_1', 'plan_1', 'MONTHLY', 'prof_1'),
      ).rejects.toThrow('You already have an active subscription to this plan');
    });

    it('throws Conflict ACTIVE_SUBSCRIPTION_EXISTS when subscribed to a different active plan', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        platformSubscriptions: [
          {
            planId: 'plan_diff',
            plan: { name: 'Premium', features: [] },
            profileId: 'prof_1',
            status: SubscriptionStatus.ACTIVE,
          },
        ],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        features: [],
        id: 'plan_1',
        stripePriceId: 'price_monthly',
      });

      await expect(
        service.createCheckout('u_1', 'plan_1', 'MONTHLY', 'prof_1'),
      ).rejects.toThrow('This profile already has an active platform plan');
    });

    it('throws error when requested billingCycle price is missing', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        features: [],
        id: 'plan_1',
        stripePriceId: 'price_monthly',
        yearlyStripePriceId: null,
      });

      await expect(
        service.createCheckout('u_1', 'plan_1', 'YEARLY', 'prof_1'),
      ).rejects.toThrow('Billing cycle YEARLY is not available for this plan');
    });

    it('makes no customer in Stripe while payments are paused', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_paused',
        email: 'paused@test.com',
        stripeCustomerId: null,
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        features: [],
        id: 'plan_1',
        stripePriceId: 'price_monthly',
      });
      const paused = new Error('payments paused');
      stripeService.assertPaymentsEnabled.mockRejectedValueOnce(paused);

      await expect(
        service.createCheckout('u_paused', 'plan_1', 'MONTHLY', 'prof_1'),
      ).rejects.toBe(paused);
      expect(stripeService.createCustomer).not.toHaveBeenCalled();
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('deduplicates in-flight checkout requests for the same user, plan and cycle', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_flight',
        email: 'flight@test.com',
        stripeCustomerId: 'cust_flight',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        features: [],
        id: 'plan_1',
        stripePriceId: 'price_monthly',
      });
      stripeService.createCheckoutSession.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ id: 'cs_flight' }), 10),
          ),
      );

      const promise1 = service.createCheckout(
        'u_flight',
        'plan_1',
        'MONTHLY',
        'prof_1',
      );
      const promise2 = service.createCheckout(
        'u_flight',
        'plan_1',
        'MONTHLY',
        'prof_1',
      );

      const [res1, res2] = await Promise.all([promise1, promise2]);
      expect(res1).toEqual({ id: 'cs_flight' });
      expect(res2).toEqual({ id: 'cs_flight' });
      expect(stripeService.createCheckoutSession).toHaveBeenCalledTimes(1);
    });

    describe('Edits Studio Pro is an add-on', () => {
      const sub = (name: string, features: string[], over = {}) => ({
        planId: `plan_${name}`,
        profileId: 'prof_1',
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        plan: { name, features },
        ...over,
      });
      const holding = (subscriptions: object[]) => {
        prisma.user.findUnique = vi.fn().mockResolvedValue({
          id: 'u_1',
          email: 'u@test.com',
          stripeCustomerId: 'cust_1',
          platformSubscriptions: subscriptions,
        });
      };
      const buying = (name: string, features: string[]) => {
        prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
          id: 'plan_new',
          name,
          features,
          stripePriceId: 'price_new',
        });
      };
      const checkout = () =>
        service.createCheckout('u_1', 'plan_new', 'MONTHLY', 'prof_1');
      beforeEach(() => {
        prisma.profile.findFirst = vi
          .fn()
          .mockResolvedValue({ id: 'prof_1', accountType: 'CREATOR' });
        stripeService.createCheckoutSession.mockResolvedValue({
          url: 'https://checkout',
        });
      });

      it('is bought beside a Verified or Premium plan', async () => {
        holding([sub('Premium', ['verified_badge', 'priority_support'])]);
        buying('Edits Studio Pro', ['studio_pro']);

        await expect(checkout()).resolves.toEqual({ url: 'https://checkout' });
      });

      it('is not bought on top of a plan that already includes it', async () => {
        holding([sub('Elite Creator', ['verified_badge', 'studio_pro'])]);
        buying('Edits Studio Pro', ['studio_pro']);

        await expect(checkout()).rejects.toThrow(
          'This profile already has Edits Studio Pro with its plan.',
        );
        expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
      });

      it('sends an add-on whose renewal failed to the billing portal, never a second checkout', async () => {
        holding([
          sub('Premium', ['verified_badge']),
          sub('Edits Studio Pro', ['studio_pro'], { status: 'PAST_DUE' }),
        ]);
        buying('Edits Studio Pro', ['studio_pro']);

        await expect(checkout()).rejects.toThrow(
          'Edits Studio Pro has a payment due. Pay it in the billing portal.',
        );
        expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
      });

      it('sends a plan whose renewal failed to the billing portal, never a second plan', async () => {
        holding([sub('Premium', ['verified_badge'], { status: 'PAST_DUE' })]);
        buying('Elite Creator', ['verified_badge']);

        await expect(checkout()).rejects.toThrow(
          'This profile has a plan with a payment due. Pay it in the billing portal.',
        );
        expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
      });

      it('leaves one payment page open per Profile and kind: the older one of a plan is expired', async () => {
        holding([]);
        buying('Elite Creator', ['verified_badge']);
        stripeService.createCheckoutSession.mockResolvedValue({
          id: 'cs_new',
          created: 500,
          url: 'https://checkout',
        });
        // Pages opened before the add-on mark are told apart by their plan.
        prisma.platformPlan.findMany = vi.fn().mockResolvedValue([
          { id: 'plan_studio', name: 'Edits Studio Pro' },
          { id: 'plan_old', name: 'Premium' },
        ]);
        const page = (
          id: string,
          metadata: object,
          created = 400,
          mode = 'subscription',
        ) => ({ id, mode, metadata, created });
        stripeService.listOpenCheckoutSessions.mockResolvedValue([
          page('cs_new', { profileId: 'prof_1', addOn: 'false' }, 500),
          page('cs_older_plan', { profileId: 'prof_1', addOn: 'false' }),
          page('cs_before_mark', { profileId: 'prof_1', planId: 'plan_old' }),
          page('cs_addon', { profileId: 'prof_1', addOn: 'true' }),
          page('cs_addon_before_mark', {
            profileId: 'prof_1',
            planId: 'plan_studio',
          }),
          page('cs_other_profile', { profileId: 'prof_2', addOn: 'false' }),
          page('cs_promotion', { profileId: 'prof_1' }, 400, 'payment'),
          // Opened at once in another tab, after this one: left alone, so
          // two pages never expire each other.
          page('cs_newer', { profileId: 'prof_1', addOn: 'false' }, 501),
        ]);

        await expect(checkout()).resolves.toMatchObject({ id: 'cs_new' });

        expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({ addOn: 'false' }),
          }),
          expect.anything(),
        );
        expect(stripeService.listOpenCheckoutSessions).toHaveBeenCalledWith(
          'cust_1',
        );
        expect(
          stripeService.expireCheckoutSession.mock.calls.map(
            (call: unknown[]) => call[0],
          ),
        ).toEqual(['cs_older_plan', 'cs_before_mark']);
      });

      it('still opens the payment page when the older ones cannot be expired', async () => {
        holding([]);
        buying('Elite Creator', ['verified_badge']);
        stripeService.listOpenCheckoutSessions.mockRejectedValueOnce(
          new Error('down'),
        );

        await expect(checkout()).resolves.toEqual({ url: 'https://checkout' });
      });

      it('does not let a Profile with the add-on buy a second plan beside its plan', async () => {
        holding([
          sub('Premium', ['verified_badge']),
          sub('Edits Studio Pro', ['studio_pro']),
        ]);
        buying('Verified', ['verified_badge']);

        await expect(checkout()).rejects.toThrow(
          'This profile already has an active platform plan',
        );
      });

      it('lets a Profile with only the add-on choose a plan without it', async () => {
        holding([sub('Edits Studio Pro', ['studio_pro'])]);
        buying('Premium', ['verified_badge', 'priority_support']);

        await expect(checkout()).resolves.toEqual({ url: 'https://checkout' });
      });

      it('asks to cancel the add-on before a plan that includes it, so the two are never charged together', async () => {
        holding([sub('Edits Studio Pro', ['studio_pro'])]);
        buying('Elite Creator', ['verified_badge', 'studio_pro']);

        await expect(checkout()).rejects.toThrow(
          'This plan includes Edits Studio Pro. Cancel Edits Studio Pro before choosing it.',
        );

        holding([
          sub('Edits Studio Pro', ['studio_pro'], { cancelAtPeriodEnd: true }),
        ]);
        await expect(checkout()).resolves.toEqual({ url: 'https://checkout' });
      });
    });

    describe('a plan belongs to one Profile', () => {
      const person = (subscriptions: object[] = []) => {
        prisma.user.findUnique = vi.fn().mockResolvedValue({
          id: 'u_1',
          email: 'u@test.com',
          stripeCustomerId: 'cust_1',
          platformSubscriptions: subscriptions,
        });
      };
      const plan = (name: string) => {
        prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
          features: [],
          id: 'plan_1',
          name,
          stripePriceId: 'price_monthly',
        });
      };
      const profileOfType = (accountType: string) => {
        prisma.profile.findFirst = vi
          .fn()
          .mockResolvedValue({ id: 'prof_1', accountType });
      };
      const checkout = () =>
        service.createCheckout('u_1', 'plan_1', 'MONTHLY', 'prof_1');
      beforeEach(() => {
        stripeService.createCheckoutSession.mockResolvedValue({
          url: 'https://checkout',
        });
      });

      it('lets a second Profile subscribe while another Profile of the person keeps its plan', async () => {
        person([
          {
            planId: 'plan_1',
            plan: { name: 'Premium', features: [] },
            profileId: 'prof_other',
            status: SubscriptionStatus.ACTIVE,
          },
        ]);
        plan('Premium');

        await expect(checkout()).resolves.toEqual({ url: 'https://checkout' });
        expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({ profileId: 'prof_1' }),
          }),
          expect.anything(),
        );
      });

      it('records the consent to start the plan at once (Art. 108 wording), not the promotion one that gives up withdrawal', async () => {
        person();
        plan('Premium');

        await checkout();

        const [params] = stripeService.createCheckoutSession.mock.calls[0];
        expect(params.metadata).toMatchObject({
          plan_start_consent: 'accepted',
          plan_start_consent_version: '2026-2',
        });
        expect(params.metadata).not.toHaveProperty('withdrawal_consent');
      });

      it('looks for the Profile among those of the person, and refuses one of someone else or none at all', async () => {
        person();
        plan('Premium');
        prisma.profile.findFirst = vi.fn().mockResolvedValue(null);

        await expect(checkout()).rejects.toThrow('Profile not found');
        expect(prisma.profile.findFirst).toHaveBeenCalledWith({
          where: { id: 'prof_1', userId: 'u_1' },
          select: { id: true, accountType: true },
        });

        prisma.profile.findFirst = vi.fn();
        await expect(
          service.createCheckout('u_1', 'plan_1', 'MONTHLY'),
        ).rejects.toThrow('Profile not found');
        expect(prisma.profile.findFirst).not.toHaveBeenCalled();
        expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
      });

      it.each([
        ['Elite Creator', 'PERSONAL', 'CREATOR'],
        ['Elite Creator', 'BUSINESS', 'CREATOR'],
        ['Business', 'PERSONAL', 'BUSINESS'],
        ['Business', 'CREATOR', 'BUSINESS'],
      ])(
        'refuses %s for a %s Profile, saying which type it is for',
        async (name, type, required) => {
          person();
          plan(name);
          profileOfType(type);

          const error = await checkout().catch((e) => e);
          expect(error.errorCode).toBe('PLAN_NOT_FOR_PROFILE_TYPE');
          expect(error.getStatus()).toBe(400);
          expect(error.details).toEqual({ requiredAccountType: required });
          expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
        },
      );

      it.each([
        ['Premium', 'PERSONAL'],
        ['Premium', 'CREATOR'],
        ['Premium', 'BUSINESS'],
        ['Elite Creator', 'CREATOR'],
        ['Business', 'BUSINESS'],
      ])('lets a %s plan be bought for a %s Profile', async (name, type) => {
        person();
        plan(name);
        profileOfType(type);

        await expect(checkout()).resolves.toEqual({ url: 'https://checkout' });
      });

      it('names the type of Profile each plan is for from its name', () => {
        expect(planAccountType('Business')).toBe('BUSINESS');
        expect(planAccountType('Elite Creator')).toBe('CREATOR');
        expect(planAccountType('Premium')).toBeNull();
        expect(planAccountType('Verified')).toBeNull();
        expect(planAccountType(undefined)).toBeNull();
      });
    });

    it('creates checkout session for yearly subscription with profileId and frontendUrl fallback', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_year',
        email: 'year@test.com',
        stripeCustomerId: 'cust_year',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        features: [],
        id: 'plan_1',
        stripePriceId: 'price_monthly',
        yearlyStripePriceId: 'price_yearly',
      });
      stripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.yearly',
      });

      const res = await service.createCheckout(
        'u_year',
        'plan_1',
        'YEARLY',
        'prof_1',
      );
      expect(res).toEqual({ url: 'https://checkout.yearly' });
      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cust_year',
          line_items: [{ price: 'price_yearly', quantity: 1 }],
          mode: 'subscription',
          metadata: expect.objectContaining({
            userId: 'u_year',
            planId: 'plan_1',
            billingCycle: 'YEARLY',
            profileId: 'prof_1',
          }),
        }),
        expect.objectContaining({
          // The consent wording is part of the parameters: its version
          // names the key, so a key used with the earlier wording is not
          // reused with this one. The minute keeps a retry on the same page
          // and a purchase made again later on a new one.
          idempotencyKey: expect.stringMatching(
            /^checkout_sub_tax_2026-2_u_year:prof_1:plan_1:YEARLY:\d+$/,
          ),
        }),
      );
      // Whoever pays is an adult.
      expect(adultPayer.assertAdultPayer).toHaveBeenCalledWith(
        expect.anything(),
        'u_year',
      );
    });

    it('asks the provider to add the VAT due, from the billing address it asks for', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_vat',
        email: 'vat@test.com',
        stripeCustomerId: 'cust_vat',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        features: [],
        id: 'plan_1',
        stripePriceId: 'price_monthly',
      });
      stripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.vat',
      });

      await service.createCheckout('u_vat', 'plan_1', 'MONTHLY', 'prof_1');

      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          automatic_tax: { enabled: true },
          billing_address_collection: 'required',
          customer_update: { address: 'auto', name: 'auto' },
        }),
        expect.anything(),
      );
    });

    it('says so in the log and lets the person try again when the provider refuses the checkout', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_year',
        email: 'year@test.com',
        stripeCustomerId: 'cust_year',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        features: [],
        id: 'plan_1',
        stripePriceId: 'price_monthly',
        yearlyStripePriceId: 'price_yearly',
      });
      const logged = vi
        .spyOn(
          (service as unknown as { logger: { error: () => void } }).logger,
          'error',
        )
        .mockImplementation(() => {});
      const attempt = () =>
        service.createCheckout('u_year', 'plan_1', 'YEARLY', 'prof_1');

      stripeService.createCheckoutSession.mockRejectedValueOnce(
        new Error('provider down'),
      );
      await expect(attempt()).rejects.toThrow('provider down');
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining('provider down'),
      );

      // What is refused is not always an error.
      stripeService.createCheckoutSession.mockRejectedValueOnce('refused');
      await expect(attempt()).rejects.toBe('refused');
      expect(logged).toHaveBeenLastCalledWith(
        expect.stringContaining('refused'),
      );

      // The failed attempt is not kept: the next one asks the provider again.
      stripeService.createCheckoutSession.mockResolvedValueOnce({
        url: 'https://checkout.again',
      });
      await expect(attempt()).resolves.toEqual({
        url: 'https://checkout.again',
      });
      logged.mockRestore();
    });

    it('ensureStripeCustomer returns existing stripeCustomerId immediately', async () => {
      const res = await service.ensureStripeCustomer({
        id: 'u1',
        email: 'u1@test.com',
        stripeCustomerId: 'cust_direct',
      });
      expect(res).toBe('cust_direct');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('ensureStripeCustomer returns stripeCustomerId from fresh DB lookup if found', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        stripeCustomerId: 'cust_db',
      });

      const res = await service.ensureStripeCustomer({
        id: 'u1',
        email: 'u1@test.com',
        stripeCustomerId: null,
      });
      expect(res).toBe('cust_db');
      expect(stripeService.createCustomer).not.toHaveBeenCalled();
    });

    it('ensureStripeCustomer throws BadRequest when customer creation fails', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
        stripeCustomerId: null,
      });
      stripeService.createCustomer.mockResolvedValue(null);

      await expect(
        service.ensureStripeCustomer({ id: 'u1', email: 'u1@test.com' }),
      ).rejects.toThrow('Stripe customer creation failed');
    });

    it('ensureStripeCustomer handles concurrent race condition when another worker updated DB', async () => {
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValueOnce({
          id: 'u1',
          email: 'u1@test.com',
          stripeCustomerId: null,
        })
        .mockResolvedValueOnce({ stripeCustomerId: 'cust_canonical' });
      stripeService.createCustomer.mockResolvedValue({ id: 'cust_race' });
      prisma.user.updateMany = vi.fn().mockResolvedValue({ count: 0 });

      const res = await service.ensureStripeCustomer({
        id: 'u1',
        email: 'u1@test.com',
      });
      expect(res).toBe('cust_canonical');
    });

    it('ensureStripeCustomer creates new customer and saves to DB when updateResult.count === 1', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_new',
        email: 'new@test.com',
        stripeCustomerId: null,
      });
      stripeService.createCustomer.mockResolvedValue({ id: 'cust_brand_new' });
      prisma.user.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      const res = await service.ensureStripeCustomer({
        id: 'u_new',
        email: 'new@test.com',
      });
      expect(res).toBe('cust_brand_new');
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u_new', stripeCustomerId: null },
        data: { stripeCustomerId: 'cust_brand_new' },
      });
    });
  });

  describe('cancelPlan', () => {
    const plan = (over: Record<string, unknown> = {}) => ({
      id: 'sub_1',
      planId: 'plan_pro',
      stripeSubscriptionId: 'stripe_sub_1',
      status: SubscriptionStatus.ACTIVE,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      currentPeriodStart: new Date('2026-10-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-11-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      plan: {
        id: 'plan_pro',
        name: 'Pro',
        priceCents: 2000,
        currency: 'EUR',
        features: [],
      },
      profile: { username: 'ana' },
      ...over,
    });

    it('cancels at the end of the period paid, marks it, and emails the payer', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ email: 'ana@example.com' });
      const stripe = stripeService;
      const email = emailService;
      email.sendPlanCancelledEmail = vi.fn().mockResolvedValue(undefined);

      await service.cancelPlan('u_1', 'prof_1');

      // Only the person who pays, for the Profile in use.
      expect(prisma.platformSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u_1',
            profileId: 'prof_1',
          }),
        }),
      );
      expect(stripe.cancelSubscription).toHaveBeenCalledWith(
        'stripe_sub_1',
        true,
      );
      expect(prisma.platformSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub_1' },
        data: { cancelAtPeriodEnd: true },
      });
      expect(email.sendPlanCancelledEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        new Date('2026-11-01T00:00:00.000Z'),
      );
    });

    it('cancels the add-on, not the plan, when asked for the add-on', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      prisma.user.findUnique = vi.fn().mockResolvedValue({ email: null });

      await service.cancelPlan('u_1', 'prof_1', true);

      expect(
        vi.mocked(prisma.platformSubscription.findFirst).mock.calls[0][0]
          ?.where,
      ).toMatchObject({ profileId: 'prof_1', addOn: true });
    });

    it('a failed email does not undo the cancellation, and a payer with no email gets none', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValueOnce({ email: 'ana@example.com' })
        .mockResolvedValueOnce({ email: null });
      emailService.sendPlanCancelledEmail = vi
        .fn()
        .mockRejectedValueOnce(new Error('mail down'));

      await service.cancelPlan('u_1', 'prof_1');
      expect(prisma.platformSubscription.update).toHaveBeenCalledTimes(1);

      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockResolvedValue(plan({ profile: null }));
      await service.cancelPlan('u_1', 'prof_1');
      expect(emailService.sendPlanCancelledEmail).toHaveBeenCalledTimes(1);
    });

    it('a failure finding the payer does not turn the cancellation into an error', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      prisma.user.findUnique = vi.fn().mockRejectedValue(new Error('db'));

      await expect(service.cancelPlan('u_1', 'prof_1')).resolves.toBeDefined();
      expect(stripeService.cancelSubscription).toHaveBeenCalled();
      expect(prisma.platformSubscription.update).toHaveBeenCalled();
    });

    it('without a Profile in use there is no plan to cancel', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      await expect(service.cancelPlan('u_1', '')).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
      expect(prisma.platformSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ profileId: '__no_profile__' }),
        }),
      );
    });

    it('a plan already cancelled is not cancelled or emailed again', async () => {
      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockResolvedValue(plan({ cancelAtPeriodEnd: true }));
      const stripe = stripeService;
      const email = emailService;
      email.sendPlanCancelledEmail = vi.fn();

      const res = await service.cancelPlan('u_1', 'prof_1');

      expect(stripe.cancelSubscription).not.toHaveBeenCalled();
      expect(email.sendPlanCancelledEmail).not.toHaveBeenCalled();
      expect(res.subscription?.cancelAtPeriodEnd).toBe(true);
    });

    it('refuses when the Profile in use has no plan the person pays', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      await expect(service.cancelPlan('u_1', 'prof_1')).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
    });

    it('nothing is marked when the payment provider refuses', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      const stripe = stripeService;
      vi.mocked(stripe.cancelSubscription).mockRejectedValueOnce(
        new Error('stripe down'),
      );

      await expect(service.cancelPlan('u_1', 'prof_1')).rejects.toThrow(
        'stripe down',
      );
      expect(prisma.platformSubscription.update).not.toHaveBeenCalled();
    });

    it('a plan the provider already ended is answered as gone, and other failures pass through', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      vi.mocked(stripeService.cancelSubscription).mockRejectedValueOnce(
        Object.assign(new Error('gone'), { type: 'StripeInvalidRequestError' }),
      );
      stripeService.getSubscription.mockRejectedValueOnce(new Error('down'));

      await expect(service.cancelPlan('u_1', 'prof_1')).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
      expect(prisma.platformSubscription.update).not.toHaveBeenCalled();

      vi.mocked(stripeService.cancelSubscription).mockRejectedValueOnce(
        Object.assign(new Error('rate limited'), {
          type: 'StripeRateLimitError',
        }),
      );
      await expect(service.cancelPlan('u_1', 'prof_1')).rejects.toThrow(
        'rate limited',
      );
    });
  });

  describe('withdrawPlan', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const _MINUTE = 60 * 1000;
    // Bought on 1 November; a 30-day period; today is 11 November: 10 days
    // used, 20 left.
    const boughtAt = new Date('2026-11-01T00:00:00.000Z');
    const periodEnd = new Date('2026-12-01T00:00:00.000Z');
    const today = new Date('2026-11-11T00:00:00.000Z');
    const seconds = (date: Date) => date.getTime() / 1000;
    type Row = Record<string, any>;
    let row: Row;
    const plan = (over: Row = {}): Row => ({
      id: 'sub_1',
      userId: 'u_1',
      planId: 'plan_pro',
      profileId: 'prof_1',
      stripeSubscriptionId: 'stripe_sub_1',
      status: SubscriptionStatus.ACTIVE,
      createdAt: boughtAt,
      providerStartedAt: boughtAt,
      currentPeriodStart: boughtAt,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      withdrawnAt: null,
      withdrawalRefundCents: null,
      withdrawalRefundId: null,
      withdrawalFinishedAt: null,
      plan: {
        id: 'plan_pro',
        name: 'Pro',
        priceCents: 999,
        currency: 'eur',
        features: [],
      },
      profile: { username: 'ana' },
      ...over,
    });
    const invoice = (over: Row = {}) => ({
      id: 'in_1',
      totalCents: 999,
      amountPaidCents: 999,
      paidCents: 999,
      currency: 'eur',
      periodStart: boughtAt,
      periodEnd,
      paymentIntentId: 'pi_1',
      ...over,
    });
    const ended = {
      id: 'stripe_sub_1',
      status: 'canceled',
      cancel_at_period_end: false,
      start_date: seconds(boughtAt),
      items: {
        data: [
          {
            current_period_start: seconds(boughtAt),
            current_period_end: seconds(today),
          },
        ],
      },
    };
    const running = { ...ended, status: 'active' };
    const refunded = (over: Row = {}) => ({
      id: 're_1',
      amount: 666,
      currency: 'eur',
      status: 'succeeded',
      ...over,
    });
    // Where the request marks the row.
    const markCall = () =>
      vi
        .mocked(prisma.platformSubscription.updateMany)
        .mock.calls.find(
          ([args]) => (args as Row).data?.withdrawnAt !== undefined,
        );
    const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
      fn.mock.invocationCallOrder[0];
    const markOrder = () => {
      const update = vi.mocked(prisma.platformSubscription.updateMany).mock;
      const i = update.calls.findIndex(
        ([args]) => (args as Row).data?.withdrawnAt !== undefined,
      );
      return update.invocationCallOrder[i];
    };
    const unavailable = {
      errorCode: 'PAYMENT_PROVIDER_UNAVAILABLE',
      status: 503,
    };
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(today);
      row = plan();
      // The row as the database holds it: the conditional writes change it
      // only when their condition still holds.
      prisma.platformSubscription.findFirst = vi.fn(async () => ({
        ...row,
      })) as any;
      (prisma.platformSubscription as any).findUnique = vi.fn(async () => ({
        ...row,
      }));
      prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([]);
      prisma.platformSubscription.updateMany = vi.fn(async (args: any) => {
        const where = args.where ?? {};
        if (where.id && where.id !== row.id) return { count: 0 };
        if ('withdrawnAt' in where && where.withdrawnAt === null) {
          if (row.withdrawnAt) return { count: 0 };
        }
        if ('withdrawalFinishedAt' in where && row.withdrawalFinishedAt) {
          return { count: 0 };
        }
        if (where.withdrawnAt?.not === null && !row.withdrawnAt) {
          return { count: 0 };
        }
        Object.assign(row, args.data);
        return { count: 1 };
      }) as any;
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ email: 'ana@example.com' });
      // What the payer's email names: the plan and the Profile.
      prisma.platformPlan.findUnique = vi.fn(async () => row.plan) as any;
      (prisma.profile as any).findUnique = vi.fn(async () => row.profile);
      stripeService.getSubscription = vi.fn().mockResolvedValue(running);
      stripeService.latestPaidInvoice = vi.fn().mockResolvedValue(invoice());
      stripeService.refundSubscriptionPayment = vi
        .fn()
        .mockImplementation(async ({ amountInCents }) =>
          refunded({ amount: amountInCents }),
        );
      stripeService.endSubscriptionNow = vi.fn().mockResolvedValue(ended);
      stripeService.voidOpenInvoices = vi.fn().mockResolvedValue(0);
      emailService.sendPlanWithdrawnEmail = vi
        .fn()
        .mockResolvedValue(undefined);
      sentry.captureException.mockClear();
      sentry.captureMessage.mockClear();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('ends the plan, voids its open invoices and refunds the unused part at the provider first, then marks the row and emails the payer, in one request', async () => {
      await service.withdrawPlan('u_1', 'prof_1');

      expect(stripeService.endSubscriptionNow).toHaveBeenCalledWith(
        'stripe_sub_1',
      );
      expect(stripeService.voidOpenInvoices).toHaveBeenCalledWith(
        'stripe_sub_1',
      );
      // 999 x 20/30 = 666 cents.
      expect(stripeService.refundSubscriptionPayment).toHaveBeenCalledWith({
        paymentIntentId: 'pi_1',
        amountInCents: 666,
        idempotencyKey: 'plan-withdrawal-stripe_sub_1',
        metadata: { reason: 'withdrawal', platformSubscriptionId: 'sub_1' },
      });
      expect(order(stripeService.endSubscriptionNow)).toBeLessThan(
        order(stripeService.voidOpenInvoices),
      );
      expect(order(stripeService.voidOpenInvoices)).toBeLessThan(
        order(stripeService.refundSubscriptionPayment),
      );
      // Marked once, conditionally, only once the provider has settled it:
      // what was refunded, nothing owed by the team, finished.
      expect(order(stripeService.refundSubscriptionPayment)).toBeLessThan(
        markOrder(),
      );
      expect(markCall()?.[0]).toEqual({
        where: { id: 'sub_1', withdrawnAt: null },
        data: {
          withdrawnAt: today,
          withdrawalRefundCents: 666,
          withdrawalRefundId: 're_1',
          withdrawalOwedByStaffCents: 0,
          withdrawalFinishedAt: today,
          providerStartedAt: boughtAt,
          status: SubscriptionStatus.CANCELLED,
        },
      });
      expect(usersService.syncUserTier).toHaveBeenCalledWith('u_1');
      expect(markOrder()).toBeLessThan(order(usersService.syncUserTier));
      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        666,
        'eur',
        0,
      );
      expect(sentry.captureException).not.toHaveBeenCalled();
      expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('withdraws from the add-on, not the plan, when asked for the add-on', async () => {
      await service.withdrawPlan('u_1', 'prof_1', true);

      expect(
        vi.mocked(prisma.platformSubscription.findFirst).mock.calls[0][0]
          ?.where,
      ).toMatchObject({ profileId: 'prof_1', addOn: true });
      expect(stripeService.endSubscriptionNow).toHaveBeenCalled();
    });

    it('acts on the running plan only, never on an older withdrawal not finished yet', async () => {
      await service.withdrawPlan('u_1', 'prof_1');

      expect(
        vi.mocked(prisma.platformSubscription.findFirst).mock.calls[0][0]
          ?.where,
      ).toEqual({
        userId: 'u_1',
        profileId: 'prof_1',
        addOn: false,
        withdrawnAt: null,
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      });
    });

    it('works out the unused part in whole cents, rounded down', () => {
      const start = boughtAt.getTime();
      const end = periodEnd.getTime();
      expect(unusedPartCents(999, start, end, start + 10 * DAY)).toBe(666);
      expect(unusedPartCents(999, start, end, start)).toBe(999);
      expect(unusedPartCents(1000, start, end, start + 1)).toBe(999);
      expect(unusedPartCents(999, start, end, end + DAY)).toBe(0);
      expect(unusedPartCents(0, start, end, start)).toBe(0);
      expect(unusedPartCents(999, end, end, start)).toBe(0);
      // A year of a large amount stays exact.
      expect(
        unusedPartCents(1_000_000_00, start, start + 365 * DAY, start + DAY),
      ).toBe(Math.floor((1_000_000_00 * 364) / 365));
    });

    it('works out the refund on the period of the row when the invoice names none', async () => {
      stripeService.latestPaidInvoice.mockResolvedValue(
        invoice({ periodStart: today, periodEnd: today }),
      );

      await service.withdrawPlan('u_1', 'prof_1');

      expect(markCall()?.[0].data.withdrawalRefundCents).toBe(666);
    });

    it('a free invoice owes nothing: no refund, and the plan still ends', async () => {
      stripeService.latestPaidInvoice.mockResolvedValue(
        invoice({
          totalCents: 0,
          amountPaidCents: 0,
          paidCents: 0,
          paymentIntentId: null,
        }),
      );

      await service.withdrawPlan('u_1', 'prof_1');

      expect(markCall()?.[0].data).toMatchObject({ withdrawalRefundCents: 0 });
      expect(stripeService.refundSubscriptionPayment).not.toHaveBeenCalled();
      expect(stripeService.endSubscriptionNow).toHaveBeenCalled();
      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        0,
        'eur',
        0,
      );
    });

    it('a plan paid wholly from the balance is withdrawn like any other: it ends, nothing goes to the card, the team owes the unused part and is told once', async () => {
      stripeService.latestPaidInvoice.mockResolvedValue(
        invoice({ amountPaidCents: 0, paidCents: 0, paymentIntentId: null }),
      );

      await expect(
        service.withdrawPlan('u_1', 'prof_1'),
      ).resolves.toBeDefined();

      expect(markCall()?.[0].data).toMatchObject({
        withdrawalRefundCents: 0,
        status: SubscriptionStatus.CANCELLED,
      });
      expect(stripeService.endSubscriptionNow).toHaveBeenCalled();
      expect(stripeService.refundSubscriptionPayment).not.toHaveBeenCalled();
      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        0,
        'eur',
        666,
      );
      expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
      expect(sentry.captureMessage).toHaveBeenCalledWith(
        'Plan withdrawal of subscription sub_1: 666 cents are owed by staff',
        {
          level: 'warning',
          tags: { area: 'plan-withdrawal' },
          // Its own issue in the tracker, so none is lost among others.
          fingerprint: ['plan-withdrawal-owed', 'sub_1'],
          extra: {
            platformSubscriptionId: 'sub_1',
            stripeSubscriptionId: 'stripe_sub_1',
            paymentIntentId: null,
            refundId: null,
            owedByStaffCents: 666,
          },
        },
      );
      expect(markCall()?.[0].data).toMatchObject({
        withdrawalOwedByStaffCents: 666,
      });
    });

    it('a plan paid 600 by card and 399 from the balance, 10 of 30 days used, refunds 400 to the card and the team owes 266, told once', async () => {
      stripeService.latestPaidInvoice.mockResolvedValue(
        invoice({ amountPaidCents: 600, paidCents: 600 }),
      );
      // Still pending at the bank: the provider finishes it.
      stripeService.refundSubscriptionPayment.mockResolvedValueOnce(
        refunded({ status: 'pending', amount: 400 }),
      );

      await service.withdrawPlan('u_1', 'prof_1');

      expect(markCall()?.[0].data).toMatchObject({
        withdrawalRefundCents: 400,
      });
      expect(stripeService.refundSubscriptionPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amountInCents: 400,
          paymentIntentId: 'pi_1',
        }),
      );
      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        400,
        'eur',
        266,
      );
      expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
      expect(sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining('266 cents'),
        expect.anything(),
      );
    });

    it('a plan paid wholly by card owes the team nothing and tells no one', async () => {
      await service.withdrawPlan('u_1', 'prof_1');

      expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('counts the 14 days from the purchase at the provider kept on the row, not from when the row was written', async () => {
      // Written on the 1st, but bought 15 days ago.
      row = plan({ providerStartedAt: new Date(today.getTime() - 15 * DAY) });

      await expect(service.withdrawPlan('u_1', 'prof_1')).rejects.toMatchObject(
        {
          errorCode: 'WITHDRAWAL_PERIOD_ENDED',
          status: 400,
          details: { deadline: '2026-11-10T00:00:00.000Z' },
          message: expect.stringContaining('2026-11-10'),
        },
      );
      expect(stripeService.getSubscription).not.toHaveBeenCalled();
      expect(markCall()).toBeUndefined();
      expect(stripeService.endSubscriptionNow).not.toHaveBeenCalled();

      // The other way round: a row written late, a purchase 13 days ago.
      row = plan({
        createdAt: new Date(today.getTime() - 20 * DAY),
        providerStartedAt: new Date(today.getTime() - 13 * DAY),
      });
      await service.withdrawPlan('u_1', 'prof_1');
      expect(markCall()).toBeDefined();
    });

    it('reads the purchase from the provider for a row that does not keep it, and keeps it', async () => {
      row = plan({ providerStartedAt: null });
      stripeService.getSubscription.mockResolvedValue({
        ...running,
        start_date: seconds(new Date(today.getTime() - 15 * DAY)),
      });

      await expect(service.withdrawPlan('u_1', 'prof_1')).rejects.toMatchObject(
        { errorCode: 'WITHDRAWAL_PERIOD_ENDED' },
      );
      expect(stripeService.getSubscription).toHaveBeenCalledWith(
        'stripe_sub_1',
      );
      // Kept, so it is read once.
      expect(row.providerStartedAt).toEqual(
        new Date(today.getTime() - 15 * DAY),
      );

      row = plan({ providerStartedAt: null });
      stripeService.getSubscription.mockResolvedValue(running);
      await service.withdrawPlan('u_1', 'prof_1');
      expect(markCall()?.[0].data.providerStartedAt).toEqual(boughtAt);
    });

    it('allows the last moment of the 14 days, and the billing status shows it until then', async () => {
      vi.setSystemTime(new Date(boughtAt.getTime() + 14 * DAY));
      const status = await service.getBillingStatus('u_1', 'prof_1');
      expect(status.subscription?.withdrawableUntil).toEqual(
        new Date(boughtAt.getTime() + 14 * DAY),
      );

      await service.withdrawPlan('u_1', 'prof_1');
      expect(markCall()).toBeDefined();
    });

    it('one moment after, both the billing status and the server refuse', async () => {
      vi.setSystemTime(new Date(boughtAt.getTime() + 14 * DAY + 1));
      const status = await service.getBillingStatus('u_1', 'prof_1');
      expect(status.subscription?.withdrawableUntil).toBeNull();

      await expect(service.withdrawPlan('u_1', 'prof_1')).rejects.toMatchObject(
        { errorCode: 'WITHDRAWAL_PERIOD_ENDED' },
      );
    });

    it('refuses when the Profile in use has no plan the person pays', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      await expect(service.withdrawPlan('u_1', '')).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
      expect(prisma.platformSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ profileId: '__no_profile__' }),
        }),
      );
      expect(stripeService.endSubscriptionNow).not.toHaveBeenCalled();
    });

    it('a subscription the provider no longer holds is answered as gone, with nothing marked', async () => {
      row = plan({ providerStartedAt: null });
      stripeService.getSubscription.mockRejectedValue(
        Object.assign(new Error('No such subscription'), {
          type: 'StripeInvalidRequestError',
        }),
      );

      await expect(service.withdrawPlan('u_1', 'prof_1')).rejects.toMatchObject(
        { errorCode: 'SUBSCRIPTION_NOT_FOUND' },
      );
      expect(markCall()).toBeUndefined();
    });

    it('a failure to stop the benefits after marking does not hold back the end and the refund', async () => {
      usersService.syncUserTier.mockRejectedValueOnce(new Error('db'));

      await expect(
        service.withdrawPlan('u_1', 'prof_1'),
      ).resolves.toBeDefined();

      expect(stripeService.endSubscriptionNow).toHaveBeenCalled();
      expect(stripeService.refundSubscriptionPayment).toHaveBeenCalled();
    });

    it('an end the provider cannot do changes nothing here: it is reported, and the person is told to try again', async () => {
      const refused = Object.assign(new Error('rate limited'), {
        type: 'StripeRateLimitError',
      });
      stripeService.endSubscriptionNow.mockRejectedValue(refused);

      await expect(service.withdrawPlan('u_1', 'prof_1')).rejects.toMatchObject(
        unavailable,
      );

      // The plan runs on, and can be withdrawn from again.
      expect(markCall()).toBeUndefined();
      expect(row).toMatchObject({
        status: SubscriptionStatus.ACTIVE,
        withdrawnAt: null,
      });
      expect(stripeService.refundSubscriptionPayment).not.toHaveBeenCalled();
      expect(emailService.sendPlanWithdrawnEmail).not.toHaveBeenCalled();
      expect(sentry.captureException).toHaveBeenCalledWith(refused, {
        tags: { area: 'plan-withdrawal' },
        fingerprint: ['plan-withdrawal-unsettled', 'sub_1'],
        extra: {
          platformSubscriptionId: 'sub_1',
          stripeSubscriptionId: 'stripe_sub_1',
          paymentIntentId: 'pi_1',
          refundCents: 666,
        },
      });
    });

    it('a refund that fails marks nothing; trying again finishes it, refunding once', async () => {
      stripeService.refundSubscriptionPayment.mockRejectedValueOnce(
        Object.assign(new Error('socket hang up'), {
          type: 'StripeConnectionError',
        }),
      );

      await expect(service.withdrawPlan('u_1', 'prof_1')).rejects.toMatchObject(
        unavailable,
      );
      expect(markCall()).toBeUndefined();
      expect(emailService.sendPlanWithdrawnEmail).not.toHaveBeenCalled();

      // Again: the plan already ended counts as ended, and the refund is
      // asked with the same key and metadata, which find any made before.
      stripeService.endSubscriptionNow.mockRejectedValueOnce(
        Object.assign(new Error('already canceled'), {
          type: 'StripeInvalidRequestError',
        }),
      );
      stripeService.getSubscription.mockResolvedValue(ended);
      await service.withdrawPlan('u_1', 'prof_1');

      expect(stripeService.refundSubscriptionPayment).toHaveBeenLastCalledWith(
        expect.objectContaining({
          idempotencyKey: 'plan-withdrawal-stripe_sub_1',
          metadata: { reason: 'withdrawal', platformSubscriptionId: 'sub_1' },
        }),
      );
      expect(row.status).toBe(SubscriptionStatus.CANCELLED);
      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledTimes(1);
    });

    it('a refund pending at the bank is left to the provider: the payer is told at once', async () => {
      stripeService.refundSubscriptionPayment.mockResolvedValue(
        refunded({ status: 'pending' }),
      );

      await service.withdrawPlan('u_1', 'prof_1');

      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        666,
        'eur',
        0,
      );
      expect(sentry.captureException).not.toHaveBeenCalled();
    });

    it('two requests at once mark the row once and tell the payer once', async () => {
      await Promise.all([
        service.withdrawPlan('u_1', 'prof_1'),
        service.withdrawPlan('u_1', 'prof_1'),
      ]);

      const update = vi.mocked(prisma.platformSubscription.updateMany).mock;
      const marks = await Promise.all(
        update.calls
          .map(([args], i) => [args as Row, update.results[i].value] as const)
          .filter(([args]) => args.data?.withdrawnAt !== undefined)
          .map(([, result]) => result),
      );
      expect(marks).toEqual([{ count: 1 }, { count: 0 }]);
      // Both settle at the provider with the same key: one refund.
      const keys = vi
        .mocked(stripeService.refundSubscriptionPayment)
        .mock.calls.map(
          (call: unknown[]) =>
            (call[0] as { idempotencyKey: string }).idempotencyKey,
        );
      expect(new Set(keys)).toEqual(new Set(['plan-withdrawal-stripe_sub_1']));
      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledTimes(1);
    });

    it('reports what the payment could not give back as owed by staff, and tells the payer', async () => {
      // Another refund already stands on the payment: only 600 of the 666
      // owed is left to refund.
      stripeService.refundSubscriptionPayment = vi
        .fn()
        .mockResolvedValue(refunded({ amount: 600 }));

      await service.withdrawPlan('u_1', 'prof_1');

      expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
      expect(sentry.captureMessage).toHaveBeenCalledWith(
        'Plan withdrawal of subscription sub_1: 66 cents are owed by staff',
        expect.objectContaining({ level: 'warning' }),
      );
      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        600,
        'eur',
        66,
      );
    });

    it('owes all of it by staff when nothing was left of the payment to refund', async () => {
      stripeService.refundSubscriptionPayment = vi.fn().mockResolvedValue(null);

      await service.withdrawPlan('u_1', 'prof_1');

      expect(sentry.captureMessage).toHaveBeenCalledWith(
        'Plan withdrawal of subscription sub_1: 666 cents are owed by staff',
        expect.anything(),
      );
      expect(emailService.sendPlanWithdrawnEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        0,
        'eur',
        666,
      );
    });

    describe('after a move to the yearly price', () => {
      const movedAt = new Date('2026-11-10T00:00:00.000Z');
      const yearEnd = new Date('2027-11-10T00:00:00.000Z');
      const yearly = (over: Row = {}) => ({
        id: 'stripe_sub_1',
        status: 'active',
        cancel_at_period_end: false,
        start_date: seconds(new Date('2026-01-01T00:00:00.000Z')),
        metadata: { moved_to_yearly: 'true' },
        items: {
          data: [
            {
              id: 'si_1',
              current_period_start: seconds(movedAt),
              current_period_end: seconds(yearEnd),
              price: { unit_amount: 9990, recurring: { interval: 'year' } },
            },
          ],
        },
        ...over,
      });

      beforeEach(() => {
        // Bought in January, moved to yearly yesterday.
        row = plan({
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          providerStartedAt: new Date('2026-01-01T00:00:00.000Z'),
          billingInterval: 'year',
          yearlyStartedAt: movedAt,
          currentPeriodStart: movedAt,
          currentPeriodEnd: yearEnd,
        });
        // The move's invoice: the year, less the rest of the month credited.
        stripeService.latestPaidInvoice = vi.fn().mockResolvedValue(
          invoice({
            id: 'in_move',
            totalCents: 8991,
            amountPaidCents: 8991,
            paidCents: 8991,
            creditCents: 999,
            periodStart: movedAt,
            periodEnd: yearEnd,
            paymentIntentId: 'pi_move',
          }),
        );
      });

      it('refunds the unused part of the whole year: of the payment as far as it goes, and the credit beyond it by staff', async () => {
        await service.withdrawPlan('u_1', 'prof_1');

        // One day of 365 used: 8991 x 364/365 = 8966 of the payment, and
        // 999 x 364/365 = 996 of the credit, 25 of it to the card (all the
        // payment can still give) and 971 by staff.
        expect(markCall()?.[0]).toMatchObject({
          data: expect.objectContaining({ withdrawalRefundCents: 8991 }),
        });
        expect(stripeService.refundSubscriptionPayment).toHaveBeenCalledWith(
          expect.objectContaining({
            paymentIntentId: 'pi_move',
            amountInCents: 8991,
          }),
        );
        expect(sentry.captureMessage).toHaveBeenCalledWith(
          'Plan withdrawal of subscription sub_1: 971 cents are owed by staff',
          expect.anything(),
        );
      });

      it('reads the provider before refusing a row still monthly, and lets the year just paid be withdrawn from', async () => {
        row = plan({
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          providerStartedAt: new Date('2026-01-01T00:00:00.000Z'),
          billingInterval: 'month',
          yearlyStartedAt: null,
        });
        stripeService.getSubscription = vi.fn().mockResolvedValue(yearly());

        await service.withdrawPlan('u_1', 'prof_1');

        expect(row.yearlyStartedAt).toEqual(movedAt);
        expect(markCall()).toBeDefined();
      });

      it('gives no new 14 days to a plan bought yearly, which the move never marked', async () => {
        row = plan({
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          providerStartedAt: new Date('2026-01-01T00:00:00.000Z'),
          billingInterval: 'month',
          yearlyStartedAt: null,
        });
        stripeService.getSubscription = vi
          .fn()
          .mockResolvedValue(yearly({ metadata: {} }));

        await expect(
          service.withdrawPlan('u_1', 'prof_1'),
        ).rejects.toMatchObject({ errorCode: 'WITHDRAWAL_PERIOD_ENDED' });
        expect(row.yearlyStartedAt).toBeNull();
        expect(markCall()).toBeUndefined();
      });

      it('refuses as before when the provider cannot be read', async () => {
        row = plan({
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          providerStartedAt: new Date('2026-01-01T00:00:00.000Z'),
          billingInterval: 'month',
          yearlyStartedAt: null,
        });
        stripeService.getSubscription = vi
          .fn()
          .mockRejectedValue(new Error('socket hang up'));

        await expect(
          service.withdrawPlan('u_1', 'prof_1'),
        ).rejects.toMatchObject({ errorCode: 'WITHDRAWAL_PERIOD_ENDED' });
      });
    });

    describe('when the provider refuses to end the plan', () => {
      beforeEach(() => {
        stripeService.endSubscriptionNow.mockRejectedValue(
          Object.assign(new Error('refused'), {
            type: 'StripeInvalidRequestError',
          }),
        );
      });

      it.each(['canceled', 'incomplete_expired'])(
        'counts it ended when the provider holds it %s, and refunds',
        async (status) => {
          stripeService.getSubscription.mockResolvedValue({ ...ended, status });

          await service.withdrawPlan('u_1', 'prof_1');

          expect(stripeService.refundSubscriptionPayment).toHaveBeenCalled();
          expect(sentry.captureException).not.toHaveBeenCalled();
        },
      );

      it('marks nothing and refunds nothing when the provider still holds it running', async () => {
        stripeService.getSubscription.mockResolvedValue(running);

        await expect(
          service.withdrawPlan('u_1', 'prof_1'),
        ).rejects.toMatchObject(unavailable);

        expect(row.status).toBe(SubscriptionStatus.ACTIVE);
        expect(sentry.captureException).toHaveBeenCalled();
        expect(stripeService.voidOpenInvoices).not.toHaveBeenCalled();
        expect(stripeService.refundSubscriptionPayment).not.toHaveBeenCalled();
        expect(emailService.sendPlanWithdrawnEmail).not.toHaveBeenCalled();
      });

      it('marks nothing when the subscription cannot be read back', async () => {
        stripeService.getSubscription.mockRejectedValue(new Error('down'));

        await expect(
          service.withdrawPlan('u_1', 'prof_1'),
        ).rejects.toMatchObject(unavailable);

        expect(sentry.captureException).toHaveBeenCalled();
        expect(stripeService.refundSubscriptionPayment).not.toHaveBeenCalled();
      });
    });

    it('a failed email does not fail the withdrawal', async () => {
      emailService.sendPlanWithdrawnEmail.mockRejectedValueOnce(
        new Error('mail down'),
      );

      await expect(
        service.withdrawPlan('u_1', 'prof_1'),
      ).resolves.toBeDefined();
      expect(stripeService.refundSubscriptionPayment).toHaveBeenCalled();
    });
  });

  describe('resumePlan', () => {
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    const plan = (over: Record<string, unknown> = {}) => ({
      id: 'sub_1',
      planId: 'plan_pro',
      stripeSubscriptionId: 'stripe_sub_1',
      status: SubscriptionStatus.ACTIVE,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      currentPeriodStart: new Date('2026-10-01T00:00:00.000Z'),
      currentPeriodEnd: future,
      cancelAtPeriodEnd: true,
      plan: {
        id: 'plan_pro',
        name: 'Pro',
        priceCents: 2000,
        currency: 'EUR',
        features: [],
      },
      profile: { username: 'ana' },
      ...over,
    });

    beforeEach(() => {
      prisma.platformSubscription.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 1 });
    });

    it('does not resume a plan for someone who is not an adult', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      adultPayer.assertAdultPayer.mockRejectedValueOnce(
        Object.assign(new Error('under age'), { errorCode: 'PAYER_UNDER_AGE' }),
      );
      await expect(service.resumePlan('u_1', 'prof_1')).rejects.toMatchObject({
        errorCode: 'PAYER_UNDER_AGE',
      });
      expect(stripeService.resumeSubscription).not.toHaveBeenCalled();
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalled();
    });

    it('takes back the cancellation, unmarks it, and emails the payer', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ email: 'ana@example.com' });
      emailService.sendPlanResumedEmail = vi.fn().mockResolvedValue(undefined);

      await service.resumePlan('u_1', 'prof_1');

      // Only the person who pays, for the Profile in use, and only a plan
      // still in force: not one whose renewal failed.
      expect(prisma.platformSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u_1',
            profileId: 'prof_1',
            status: {
              in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
            },
          }),
        }),
      );
      expect(stripeService.resumeSubscription).toHaveBeenCalledWith(
        'stripe_sub_1',
      );
      // Changed only while still cancelled.
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: { id: 'sub_1', cancelAtPeriodEnd: true },
        data: { cancelAtPeriodEnd: false },
      });
      expect(emailService.sendPlanResumedEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        'ana',
        future,
      );
    });

    it('does not resume the add-on beside a plan that already includes it', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      prisma.platformSubscription.count = vi.fn().mockResolvedValue(1);

      await expect(service.resumePlan('u_1', 'prof_1', true)).rejects.toThrow(
        'This profile already has Edits Studio Pro with its plan.',
      );
      expect(stripeService.resumeSubscription).not.toHaveBeenCalled();
      expect(
        vi.mocked(prisma.platformSubscription.count).mock.calls[0][0]?.where,
      ).toMatchObject({ profileId: 'prof_1', addOn: false });
    });

    it('resumes the add-on, not the plan, when asked for the add-on', async () => {
      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockResolvedValue(plan({ cancelAtPeriodEnd: false }));

      await service.resumePlan('u_1', 'prof_1', true);

      expect(
        vi.mocked(prisma.platformSubscription.findFirst).mock.calls[0][0]
          ?.where,
      ).toMatchObject({ profileId: 'prof_1', addOn: true });
    });

    it('a plan that is not cancelled is left as it is', async () => {
      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockResolvedValue(plan({ cancelAtPeriodEnd: false }));
      emailService.sendPlanResumedEmail = vi.fn();

      const res = await service.resumePlan('u_1', 'prof_1');

      expect(stripeService.resumeSubscription).not.toHaveBeenCalled();
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalled();
      expect(emailService.sendPlanResumedEmail).not.toHaveBeenCalled();
      expect(res).toBeDefined();
    });

    it('a plan whose period has ended is not resumed', async () => {
      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockResolvedValue(
          plan({ currentPeriodEnd: new Date(Date.now() - 1000) }),
        );

      await expect(service.resumePlan('u_1', 'prof_1')).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
      expect(stripeService.resumeSubscription).not.toHaveBeenCalled();
    });

    it('refuses without a plan the person pays for the Profile in use', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      await expect(service.resumePlan('u_1', '')).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
      expect(prisma.platformSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ profileId: '__no_profile__' }),
        }),
      );
    });

    it('nothing is unmarked when the payment provider refuses', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      vi.mocked(stripeService.resumeSubscription).mockRejectedValueOnce(
        new Error('stripe down'),
      );

      await expect(service.resumePlan('u_1', 'prof_1')).rejects.toThrow(
        'stripe down',
      );
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalled();
    });

    it('a failed lookup of the payer, or a payer with no email, does not undo the resumption', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      prisma.user.findUnique = vi
        .fn()
        .mockRejectedValueOnce(new Error('db'))
        .mockResolvedValueOnce({ email: null });
      emailService.sendPlanResumedEmail = vi.fn();

      await expect(service.resumePlan('u_1', 'prof_1')).resolves.toBeDefined();
      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockResolvedValue(plan({ profile: null }));
      await expect(service.resumePlan('u_1', 'prof_1')).resolves.toBeDefined();

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledTimes(2);
      expect(emailService.sendPlanResumedEmail).not.toHaveBeenCalled();
    });

    it('a payer whose plan has no Profile name is still emailed', async () => {
      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockResolvedValue(plan({ profile: null }));
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ email: 'ana@example.com' });
      emailService.sendPlanResumedEmail = vi.fn().mockResolvedValue(undefined);

      await service.resumePlan('u_1', 'prof_1');

      expect(emailService.sendPlanResumedEmail).toHaveBeenCalledWith(
        'ana@example.com',
        'Pro',
        '',
        future,
      );
    });

    it('two requests at once email the payer once', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      prisma.platformSubscription.updateMany = vi
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ email: 'ana@example.com' });
      emailService.sendPlanResumedEmail = vi.fn().mockResolvedValue(undefined);

      await Promise.all([
        service.resumePlan('u_1', 'prof_1'),
        service.resumePlan('u_1', 'prof_1'),
      ]);

      expect(emailService.sendPlanResumedEmail).toHaveBeenCalledTimes(1);
    });

    it('a plan the provider already ended is synced and answered as gone', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      emailService.sendPlanResumedEmail = vi.fn();
      const refused = Object.assign(new Error('No such subscription'), {
        type: 'StripeInvalidRequestError',
      });
      vi.mocked(stripeService.resumeSubscription).mockRejectedValueOnce(
        refused,
      );
      stripeService.getSubscription.mockResolvedValueOnce({
        id: 'stripe_sub_1',
        status: 'canceled',
        cancel_at_period_end: false,
        items: {
          data: [
            {
              current_period_start: 1_796_061_164,
              current_period_end: 1_798_653_164,
            },
          ],
        },
      });

      await expect(service.resumePlan('u_1', 'prof_1')).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: written('stripe_sub_1'),
        data: expect.objectContaining({ status: SubscriptionStatus.CANCELLED }),
      });
      expect(emailService.sendPlanResumedEmail).not.toHaveBeenCalled();
    });

    it('a provider refusal it cannot read again still answers the plan as gone', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(plan());
      vi.mocked(stripeService.resumeSubscription).mockRejectedValueOnce(
        Object.assign(new Error('gone'), { type: 'StripeInvalidRequestError' }),
      );
      stripeService.getSubscription.mockRejectedValueOnce(new Error('down'));

      await expect(service.resumePlan('u_1', 'prof_1')).rejects.toMatchObject({
        errorCode: 'SUBSCRIPTION_NOT_FOUND',
      });
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('switchPlanToYearly', () => {
    const periodStart = 1_793_000_000;
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'sub_1',
      planId: 'plan_premium',
      stripeSubscriptionId: 'stripe_sub_1',
      status: SubscriptionStatus.ACTIVE,
      addOn: false,
      billingInterval: 'month',
      cancelAtPeriodEnd: false,
      withdrawnAt: null,
      providerStartedAt: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      currentPeriodStart: new Date('2026-11-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
      plan: {
        id: 'plan_premium',
        name: 'Premium',
        priceCents: 999,
        yearlyPriceCents: 9990,
        yearlyStripePriceId: 'price_year',
        currency: 'EUR',
        features: [],
      },
      ...over,
    });
    const atProvider = (
      interval: string,
      over: Record<string, unknown> = {},
    ) => ({
      id: 'stripe_sub_1',
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: 'si_1',
            current_period_start: periodStart,
            current_period_end: periodStart + 30 * 86400,
            price: { id: `price_${interval}`, recurring: { interval } },
          },
        ],
      },
      ...over,
    });

    beforeEach(() => {
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ isTestAccount: false });
      prisma.platformSubscription.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 1 });
      stripeService.switchSubscriptionPrice = vi.fn();
    });

    it('moves the monthly plan to its yearly price now, crediting the rest of the month, and keeps it yearly on the row', async () => {
      // The row before the change, then as the status reads it after.
      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockResolvedValueOnce(row())
        .mockResolvedValue(row({ billingInterval: 'year' }));
      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockResolvedValue(atProvider('month'));
      stripeService.switchSubscriptionPrice.mockResolvedValue(
        atProvider('year', { metadata: { moved_to_yearly: 'true' } }),
      );

      const result = await service.switchPlanToYearly('u_1', 'prof_1');

      expect(stripeService.switchSubscriptionPrice).toHaveBeenCalledWith({
        subscriptionId: 'stripe_sub_1',
        itemId: 'si_1',
        priceId: 'price_year',
        metadata: expect.objectContaining({
          plan_start_consent: expect.any(String),
        }),
        // A key of this request: the library's retries reuse it.
        idempotencyKey: expect.stringMatching(
          /^plan_yearly_.+_stripe_sub_1_\d+$/,
        ),
      });
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: written('stripe_sub_1'),
          data: expect.objectContaining({ billingInterval: 'year' }),
        }),
      );
      // The move is a new contract: its 14 days count from the new period.
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          stripeSubscriptionId: 'stripe_sub_1',
          billingInterval: 'month',
        },
        data: { yearlyStartedAt: new Date(periodStart * 1000) },
      });
      expect(result.paymentUrl).toBeNull();
      expect(result.subscription).toMatchObject({
        billingInterval: 'year',
        priceCents: 9990,
        yearlyPriceCents: null,
      });
    });

    it('leaves the plan monthly and gives the page to pay when the charge waits for the payer', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockResolvedValue(atProvider('month'));
      stripeService.switchSubscriptionPrice.mockResolvedValue(
        atProvider('month', {
          pending_update: { subscription_items: [] },
          latest_invoice: {
            status: 'open',
            hosted_invoice_url: 'https://pay.example/inv_1',
          },
        }),
      );

      const result = await service.switchPlanToYearly('u_1', 'prof_1');

      expect(result.paymentUrl).toBe('https://pay.example/inv_1');
      // Only the claim is written: the row stays monthly until it is paid.
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: written('stripe_sub_1') }),
      );
      expect(result.subscription).toMatchObject({
        billingInterval: 'month',
        priceCents: 999,
        yearlyPriceCents: 9990,
      });
    });

    it('charges nothing again when the provider already holds it yearly, and brings the row in line', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockResolvedValue(atProvider('year'));

      await service.switchPlanToYearly('u_1', 'prof_1');

      expect(stripeService.switchSubscriptionPrice).not.toHaveBeenCalled();
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ billingInterval: 'year' }),
        }),
      );
    });

    it.each([
      ['no plan', null, 'SUBSCRIPTION_NOT_FOUND'],
      [
        'a renewal that failed',
        row({ status: SubscriptionStatus.PAST_DUE }),
        'SUBSCRIPTION_NOT_FOUND',
      ],
      [
        'a plan already yearly',
        row({ billingInterval: 'year' }),
        'ACTIVE_SUBSCRIPTION_EXISTS',
      ],
      [
        'a cancelled plan',
        row({ cancelAtPeriodEnd: true }),
        'ACTIVE_SUBSCRIPTION_EXISTS',
      ],
      [
        'a withdrawn plan',
        row({ withdrawnAt: new Date() }),
        'ACTIVE_SUBSCRIPTION_EXISTS',
      ],
      [
        'a plan with no yearly price',
        row({
          plan: {
            ...row().plan,
            yearlyStripePriceId: null,
            yearlyPriceCents: null,
          },
        }),
        'PRICE_NOT_FOUND',
      ],
    ])('refuses %s and charges nothing', async (_label, found, errorCode) => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(found);
      await expect(
        service.switchPlanToYearly('u_1', 'prof_1'),
      ).rejects.toMatchObject({ errorCode });
      expect(stripeService.switchSubscriptionPrice).not.toHaveBeenCalled();
    });

    it('answers that the plan has ended when the provider no longer holds it, on reading it or on moving it', async () => {
      const gone = Object.assign(new Error('No such subscription'), {
        type: 'StripeInvalidRequestError',
      });
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscription = vi.fn().mockRejectedValue(gone);
      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockRejectedValue(gone);
      await expect(
        service.switchPlanToYearly('u_1', 'prof_1'),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_NOT_FOUND' });

      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockResolvedValue(atProvider('month'));
      stripeService.switchSubscriptionPrice.mockRejectedValue(gone);
      await expect(
        service.switchPlanToYearly('u_1', 'prof_1'),
      ).rejects.toMatchObject({ errorCode: 'SUBSCRIPTION_NOT_FOUND' });
    });

    it('says the yearly price could not be applied, not that the plan ended, when the provider refuses the change of a running plan', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockResolvedValue(atProvider('month'));
      stripeService.getSubscription = vi
        .fn()
        .mockResolvedValue(atProvider('month'));
      stripeService.switchSubscriptionPrice.mockRejectedValue(
        Object.assign(new Error('No such price'), {
          type: 'StripeInvalidRequestError',
        }),
      );
      await expect(
        service.switchPlanToYearly('u_1', 'prof_1'),
      ).rejects.toMatchObject({ errorCode: 'PRICE_NOT_FOUND' });
    });

    it('refuses a second request while the first holds the move, before asking the provider anything', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      prisma.platformSubscription.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 0 });
      stripeService.getSubscriptionWithInvoice = vi.fn();
      await expect(
        service.switchPlanToYearly('u_1', 'prof_1'),
      ).rejects.toMatchObject({ errorCode: 'ACTIVE_SUBSCRIPTION_EXISTS' });
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'sub_1',
          billingInterval: 'month',
          OR: [
            { yearlyMoveClaimedAt: null },
            { yearlyMoveClaimedAt: { lt: expect.any(Date) } },
          ],
        },
        data: { yearlyMoveClaimedAt: expect.any(Date) },
      });
      expect(stripeService.getSubscriptionWithInvoice).not.toHaveBeenCalled();
      expect(stripeService.switchSubscriptionPrice).not.toHaveBeenCalled();
    });

    it.each([
      ['cancelled at the end of its period', { cancel_at_period_end: true }],
      ['not running', { status: 'past_due' }],
    ])(
      'charges nothing for a plan the provider holds %s, and brings the row in line',
      async (_label, over) => {
        prisma.platformSubscription.findFirst = vi
          .fn()
          .mockResolvedValue(row());
        stripeService.getSubscriptionWithInvoice = vi
          .fn()
          .mockResolvedValue(atProvider('month', over));
        await expect(
          service.switchPlanToYearly('u_1', 'prof_1'),
        ).rejects.toMatchObject({ errorCode: 'ACTIVE_SUBSCRIPTION_EXISTS' });
        expect(stripeService.switchSubscriptionPrice).not.toHaveBeenCalled();
        expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: written('stripe_sub_1') }),
        );
      },
    );

    it('gives again the page of a move that still waits for its charge, and charges nothing new', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscriptionWithInvoice = vi.fn().mockResolvedValue(
        atProvider('month', {
          pending_update: {},
          latest_invoice: {
            status: 'open',
            hosted_invoice_url: 'https://pay.example/inv_1',
          },
        }),
      );
      const result = await service.switchPlanToYearly('u_1', 'prof_1');
      expect(result).toMatchObject({
        pending: true,
        paymentUrl: 'https://pay.example/inv_1',
      });
      expect(stripeService.switchSubscriptionPrice).not.toHaveBeenCalled();
    });

    it('offers no page for a waiting charge whose invoice can no longer be paid', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockResolvedValue(atProvider('month'));
      stripeService.switchSubscriptionPrice.mockResolvedValue(
        atProvider('month', {
          pending_update: {},
          latest_invoice: {
            status: 'void',
            hosted_invoice_url: 'https://pay.example/void',
          },
        }),
      );
      const result = await service.switchPlanToYearly('u_1', 'prof_1');
      expect(result).toMatchObject({ pending: true, paymentUrl: null });
    });

    it('asks again for a move whose earlier charge expired unpaid, under a new key', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscriptionWithInvoice = vi.fn().mockResolvedValue(
        atProvider('month', {
          pending_update: null,
          latest_invoice: {
            status: 'void',
            hosted_invoice_url: 'https://pay.example/old',
          },
        }),
      );
      stripeService.switchSubscriptionPrice.mockResolvedValue(
        atProvider('month', {
          pending_update: {},
          latest_invoice: {
            status: 'open',
            hosted_invoice_url: 'https://pay.example/new',
          },
        }),
      );
      const result = await service.switchPlanToYearly('u_1', 'prof_1');
      expect(result.paymentUrl).toBe('https://pay.example/new');
      expect(stripeService.switchSubscriptionPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(
            /^plan_yearly_.+_stripe_sub_1_\d+$/,
          ),
        }),
      );
    });

    it('marks the move at the provider, so only a moved plan starts new 14 days', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockResolvedValue(atProvider('month'));
      stripeService.switchSubscriptionPrice.mockResolvedValue(
        atProvider('month', { pending_update: {}, latest_invoice: null }),
      );
      const result = await service.switchPlanToYearly('u_1', 'prof_1');
      expect(stripeService.switchSubscriptionPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ moved_to_yearly: 'true' }),
        }),
      );
      // Waiting with no page to pay given: said to be waiting, none offered.
      expect(result).toMatchObject({ pending: true, paymentUrl: null });
    });

    it('charges nothing for a subscription with no item at the provider', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      stripeService.getSubscriptionWithInvoice = vi
        .fn()
        .mockResolvedValue(atProvider('month', { items: { data: [] } }));
      await expect(service.switchPlanToYearly('u_1', 'prof_1')).rejects.toThrow(
        /no item to move/,
      );
      expect(stripeService.switchSubscriptionPrice).not.toHaveBeenCalled();
    });

    it('refuses someone who is not an adult before anything is charged', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(row());
      adultPayer.assertAdultPayer.mockRejectedValueOnce(
        Object.assign(new Error('under age'), { errorCode: 'PAYER_UNDER_AGE' }),
      );
      await expect(
        service.switchPlanToYearly('u_1', 'prof_1'),
      ).rejects.toMatchObject({ errorCode: 'PAYER_UNDER_AGE' });
      expect(stripeService.switchSubscriptionPrice).not.toHaveBeenCalled();
    });

    it('counts the 14 days to withdraw from the move to the yearly price, not from the first purchase', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-20T00:00:00.000Z'));
      try {
        const movedAt = new Date('2026-11-15T00:00:00.000Z');
        prisma.platformSubscription.findFirst = vi
          .fn()
          .mockResolvedValueOnce(
            row({
              billingInterval: 'year',
              yearlyStartedAt: movedAt,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
            }),
          )
          .mockResolvedValue(null);
        const status = await service.getBillingStatus('u_1', 'prof_1');
        expect(status.subscription?.withdrawableUntil).toEqual(
          new Date('2026-11-29T00:00:00.000Z'),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('looks only at the plan of the Profile in use that the person pays, never an add-on', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);
      await expect(
        service.switchPlanToYearly('u_1', 'prof_1'),
      ).rejects.toThrow();
      expect(prisma.platformSubscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u_1',
            profileId: 'prof_1',
            addOn: false,
          }),
        }),
      );
    });
  });

  describe('getBillingStatus', () => {
    describe('withdrawableUntil', () => {
      const boughtAt = new Date('2026-11-01T00:00:00.000Z');
      const row = (status: SubscriptionStatus) => ({
        id: 'sub_1',
        planId: 'plan_pro',
        status,
        createdAt: boughtAt,
        currentPeriodStart: boughtAt,
        currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
        cancelAtPeriodEnd: false,
        plan: { name: 'Pro', priceCents: 999, currency: 'eur', features: [] },
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('is 14 days after the purchase at the provider while they last, for the plan and the add-on, read once and kept for a row that does not keep it', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-10T00:00:00.000Z'));
        prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
          ...row(SubscriptionStatus.ACTIVE),
          // Written a day after the purchase.
          createdAt: new Date('2026-11-02T00:00:00.000Z'),
          providerStartedAt: null,
          stripeSubscriptionId: 'stripe_sub_1',
        });
        stripeService.getSubscription.mockResolvedValue({
          start_date: boughtAt.getTime() / 1000,
        });

        const res = await service.getBillingStatus('u_1', 'prof_1');

        const until = new Date('2026-11-15T00:00:00.000Z');
        expect(res.subscription?.withdrawableUntil).toEqual(until);
        expect(res.studioPro.subscription?.withdrawableUntil).toEqual(until);
        expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
          where: { id: 'sub_1', providerStartedAt: null },
          data: { providerStartedAt: boughtAt },
        });
      });

      it('is not offered while the purchase cannot be read from the provider', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-10T00:00:00.000Z'));
        prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
          ...row(SubscriptionStatus.ACTIVE),
          providerStartedAt: null,
        });
        stripeService.getSubscription.mockRejectedValue(new Error('down'));

        const res = await service.getBillingStatus('u_1', 'prof_1');

        expect(res.subscription?.withdrawableUntil).toBeNull();
      });

      it('does not ask the provider for a row written more than 14 days ago', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-20T00:00:00.000Z'));
        prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
          ...row(SubscriptionStatus.ACTIVE),
          providerStartedAt: null,
        });

        const res = await service.getBillingStatus('u_1', 'prof_1');

        expect(res.subscription?.withdrawableUntil).toBeNull();
        expect(stripeService.getSubscription).not.toHaveBeenCalled();
      });

      it('is null once the 14 days have passed', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-15T00:00:00.001Z'));
        prisma.platformSubscription.findFirst = vi
          .fn()
          .mockResolvedValue(row(SubscriptionStatus.ACTIVE));

        const res = await service.getBillingStatus('u_1', 'prof_1');

        expect(res.subscription?.withdrawableUntil).toBeNull();
      });

      it('counts from the purchase at the provider when the row keeps it, not from when the row was written', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-10T00:00:00.000Z'));
        prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
          ...row(SubscriptionStatus.ACTIVE),
          createdAt: new Date('2026-11-02T00:00:00.000Z'),
          providerStartedAt: boughtAt,
        });

        const res = await service.getBillingStatus('u_1', 'prof_1');

        expect(res.subscription?.withdrawableUntil).toEqual(
          new Date('2026-11-15T00:00:00.000Z'),
        );
      });

      it('is null for a plan that no longer runs', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-10T00:00:00.000Z'));
        prisma.platformSubscription.findFirst = vi
          .fn()
          .mockResolvedValue(row(SubscriptionStatus.CANCELLED));

        const res = await service.getBillingStatus('u_1', 'prof_1');

        expect(res.subscription?.withdrawableUntil).toBeNull();
      });
    });
    it('returns hasActiveSubscription: true for ACTIVE subscription', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
        id: 'sub_1',
        planId: 'plan_pro',
        status: SubscriptionStatus.ACTIVE,
        createdAt: new Date('2026-01-01'),
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-02-01'),
        cancelAtPeriodEnd: false,
        plan: {
          id: 'plan_pro',
          name: 'Pro',
          priceCents: 2000,
          currency: 'EUR',
          features: [],
        },
      });

      const res = await service.getBillingStatus('u_1', 'prof_1');
      expect(res.hasActiveSubscription).toBe(true);
      expect(res.subscription?.planName).toBe('Pro');
      expect(res.subscription?.priceCents).toBe(2000);
    });

    it('returns hasActiveSubscription: false for PAST_DUE subscription', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
        id: 'sub_past',
        planId: 'plan_pro',
        status: SubscriptionStatus.PAST_DUE,
        createdAt: new Date('2026-01-01'),
        plan: { name: 'Pro', priceCents: 2000, currency: 'EUR', features: [] },
      });

      const res = await service.getBillingStatus('u_1', 'prof_1');
      expect(res.hasActiveSubscription).toBe(false);
      expect(res.subscription?.status).toBe(SubscriptionStatus.PAST_DUE);
    });

    it('reads the plan of the Profile in use, and names the other Profiles of the person that have one', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);
      prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([
        {
          status: SubscriptionStatus.ACTIVE,
          plan: { name: 'Business' },
          profile: { id: 'prof_shop', username: 'ana.shop' },
        },
        // Kept after its Profile was removed: not listed.
        {
          status: SubscriptionStatus.ACTIVE,
          plan: { name: 'Premium' },
          profile: null,
        },
      ]);

      const res = await service.getBillingStatus('u_1', 'prof_1');

      expect(
        vi.mocked(prisma.platformSubscription.findFirst).mock.calls[0][0]
          ?.where,
      ).toMatchObject({ userId: 'u_1', profileId: 'prof_1' });
      expect(
        vi.mocked(prisma.platformSubscription.findMany).mock.calls[0][0]?.where,
      ).toMatchObject({ userId: 'u_1', profileId: { not: 'prof_1' } });
      expect(res.hasActiveSubscription).toBe(false);
      expect(res.otherProfiles).toEqual([
        {
          profileId: 'prof_shop',
          username: 'ana.shop',
          planName: 'Business',
          status: SubscriptionStatus.ACTIVE,
        },
      ]);
    });

    it('gives a session without a Profile no plan, never the one of another Profile', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      await service.getBillingStatus('u_1', '');

      expect(
        vi.mocked(prisma.platformSubscription.findFirst).mock.calls[0][0]
          ?.where,
      ).toMatchObject({ profileId: '__no_profile__' });
    });

    it('gives the plan and the Edits Studio Pro add-on apart, and says when the plan already includes it', async () => {
      const row = (name: string, features: string[]) => ({
        id: `sub_${name}`,
        planId: `plan_${name}`,
        status: SubscriptionStatus.ACTIVE,
        createdAt: new Date('2026-01-01'),
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-02-01'),
        cancelAtPeriodEnd: false,
        plan: {
          id: `plan_${name}`,
          name,
          priceCents: 799,
          currency: 'EUR',
          features,
        },
      });
      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where.addOn
              ? row('Edits Studio Pro', ['studio_pro'])
              : row('Premium', ['verified_badge']),
          ),
        );

      const res = await service.getBillingStatus('u_1', 'prof_1');

      expect(res.subscription?.planName).toBe('Premium');
      expect(res.studioPro).toEqual({
        includedInPlan: false,
        subscription: expect.objectContaining({ planName: 'Edits Studio Pro' }),
      });

      prisma.platformSubscription.findFirst = vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where.addOn ? null : row('Business', ['team_access', 'studio_pro']),
          ),
        );
      const business = await service.getBillingStatus('u_1', 'prof_1');
      expect(business.studioPro).toEqual({
        includedInPlan: true,
        subscription: null,
      });
    });

    it('returns null subscription when no subscription found', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      const res = await service.getBillingStatus('u_1', 'prof_1');
      expect(res.hasActiveSubscription).toBe(false);
      expect(res.subscription).toBeNull();
    });
  });

  describe('getPortalUrl', () => {
    it('throws USER_NOT_FOUND when user does not exist', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue(null);
      await expect(service.getPortalUrl('u_none')).rejects.toThrow(
        'User not found',
      );
    });

    it('creates and returns billing portal session', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_portal',
        email: 'p@test.com',
        stripeCustomerId: 'cust_portal',
      });
      stripeService.createPortalSession.mockResolvedValue({
        url: 'https://billing.stripe.test',
      });

      const res = await service.getPortalUrl('u_portal');
      expect(res).toEqual({ url: 'https://billing.stripe.test' });
      expect(stripeService.createPortalSession).toHaveBeenCalledWith(
        'cust_portal',
        'http://localhost:5173/accounts/billing',
      );
    });
  });

  describe('constructEvent', () => {
    it('delegates to stripeService.constructEvent', () => {
      const buf = Buffer.from('payload');
      stripeService.constructEvent = vi.fn().mockReturnValue({ id: 'evt_1' });

      const res = service.constructEvent(buf, 'sig_1');
      expect(res).toEqual({ id: 'evt_1' });
      expect(stripeService.constructEvent).toHaveBeenCalledWith(buf, 'sig_1');
    });
  });

  describe('a notice of the provider, recorded once', () => {
    const notice = { id: 'evt_n', type: 'unknown.event.type', data: {} };

    it('records a new notice with its payload, handles it, and marks it PROCESSED', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue(null);
      prisma.webhookEvent.upsert = vi.fn().mockResolvedValue({});
      prisma.webhookEvent.update = vi.fn().mockResolvedValue({});

      await service.processWebhookEvent(asEvent(notice));

      expect(prisma.webhookEvent.upsert).toHaveBeenCalledWith({
        where: { externalId: 'evt_n' },
        update: { status: 'PENDING' },
        create: {
          provider: 'stripe',
          externalId: 'evt_n',
          payload: notice,
          status: 'PENDING',
        },
      });
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { externalId: 'evt_n' },
        data: { status: 'PROCESSED', processedAt: expect.any(Date) },
      });
    });

    it.each(['PENDING', 'FAILED'])(
      'handles again a notice sent again that was left %s (a crash, or a failure)',
      async (status) => {
        prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue({ status });
        prisma.webhookEvent.upsert = vi.fn().mockResolvedValue({});
        prisma.webhookEvent.update = vi.fn().mockResolvedValue({});

        await service.processWebhookEvent(asEvent(notice));

        expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'PROCESSED' }),
          }),
        );
      },
    );

    it('marks a notice whose handling failed FAILED and throws, so the provider sends it again', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue(null);
      prisma.webhookEvent.upsert = vi.fn().mockResolvedValue({});
      prisma.webhookEvent.update = vi.fn().mockResolvedValue({});

      await expect(
        service.processWebhookEvent(
          asEvent({
            id: 'evt_unpaid',
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_unpaid',
                mode: 'payment',
                payment_status: 'unpaid',
              },
            },
          }),
        ),
      ).rejects.toThrow('not paid');
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { externalId: 'evt_unpaid' },
        data: { status: 'FAILED' },
      });
    });
  });

  describe('Webhook Handler', () => {
    it('1. should skip already PROCESSED webhook events', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue({
        status: 'PROCESSED',
        externalId: 'evt_duplicate',
      });

      const event = {
        id: 'evt_duplicate',
        type: 'checkout.session.completed',
        data: {},
      };

      await expect(
        service.processWebhookEvent(asEvent(event)),
      ).resolves.toBeUndefined();
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('1b. should mark FAILED and rethrow when handler fails', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue(null);
      prisma.webhookEvent.create = vi.fn().mockResolvedValue({ id: 'wh_fail' });
      prisma.webhookEvent.update = vi.fn().mockResolvedValue({});
      paymentEvents.handleCheckoutSessionCompleted = vi
        .fn()
        .mockRejectedValue(new Error('db down'));

      const event = {
        id: 'evt_fail',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_1',
            mode: 'payment',
            payment_status: 'paid',
            amount_total: 1000,
            currency: 'eur',
            metadata: { type: 'PROMOTION', promotionId: 'promo_1' },
          },
        },
      };

      await expect(service.processWebhookEvent(asEvent(event))).rejects.toThrow(
        'db down',
      );
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { externalId: 'evt_fail' },
        data: { status: 'FAILED' },
      });
    });

    it('1c. should reprocess FAILED events', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue({
        status: 'FAILED',
        externalId: 'evt_retry',
      });
      prisma.webhookEvent.update = vi.fn().mockResolvedValue({});

      const event = {
        id: 'evt_retry',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_retry',
            mode: 'payment',
            payment_status: 'paid',
            amount_total: 5000,
            currency: 'eur',
            metadata: {
              type: 'PROMOTION',
              promotionId: 'promo_retry',
              userId: 'u1',
            },
          },
        },
      };

      await service.processWebhookEvent(asEvent(event));
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(paymentEvents.handleCheckoutSessionCompleted).toHaveBeenCalled();
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { externalId: 'evt_retry' },
        data: { status: 'PROCESSED', processedAt: expect.any(Date) },
      });
    });

    it('2. should handle checkout.session.completed for platform subscription', async () => {
      const event = {
        id: 'evt_sub_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_sub_123',
            amount_total: 1000,
            currency: 'eur',
            subscription: 'sub_123',
            metadata: {
              userId: 'user1',
              planId: 'plan_elite',
            },
          },
        },
      };

      stripeService.getSubscription.mockResolvedValue({
        status: 'active',
        items: {
          data: [
            {
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            },
          ],
        },
        cancel_at_period_end: false,
      });

      prisma.platformPlan.findUnique = vi.fn().mockResolvedValue({
        id: 'plan_elite',
        name: 'Elite',
      });
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'user1',
        email: 'user1@test.com',
      });
      // The Profile holds no other plan.
      prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([]);

      await service.processWebhookEvent(asEvent(event));

      // The plan is recorded for a Profile of the person: none was named,
      // so the oldest one.
      expect(prisma.profile.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user1' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      expect(prisma.platformSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            userId: 'user1',
            profileId: 'prof_1',
            addOn: false,
          }),
        }),
      );
      // Only the other plans of that Profile are looked at: a plan is never
      // weighed against the add-on beside it.
      expect(prisma.platformSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ profileId: 'prof_1', addOn: false }),
        }),
      );
      expect(stripeService.refundSubscriptionPayment).not.toHaveBeenCalled();
      expect(usersService.syncUserTier).toHaveBeenCalledWith('user1');
      // Retried after a withdrawal, the notice leaves the row CANCELLED.
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          stripeSubscriptionId: 'sub_123',
          withdrawnAt: { not: null },
          status: { not: SubscriptionStatus.CANCELLED },
        },
        data: { status: SubscriptionStatus.CANCELLED },
      });
      expect(
        vi.mocked(prisma.platformSubscription.upsert).mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        vi
          .mocked(prisma.platformSubscription.updateMany)
          .mock.invocationCallOrder.at(-1)!,
      );
      expect(stripeService.cancelSubscription).not.toHaveBeenCalled();
      expect(emailService.sendSubscriptionReceipt).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.alert',
        expect.objectContaining({
          eventType: 'Platform Subscription Checkout',
        }),
      );
      expect(prisma.webhookEvent.update).toHaveBeenCalled();
    });

    it('2a. keeps the start of the year moved to, and how often and how much it is charged, when the checkout notice comes after a move', async () => {
      const start = Math.floor(Date.now() / 1000);
      stripeService.getSubscription.mockResolvedValue({
        id: 'sub_moved',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { moved_to_yearly: 'true' },
        items: {
          data: [
            {
              current_period_start: start,
              current_period_end: start + 365 * 86400,
              price: { unit_amount: 9990, recurring: { interval: 'year' } },
            },
          ],
        },
      });
      prisma.platformPlan.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'plan_premium', name: 'Premium' });
      prisma.platformSubscription.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 1 });

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_sub_moved',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_sub_moved',
              amount_total: 999,
              currency: 'eur',
              subscription: 'sub_moved',
              metadata: { userId: 'user1', planId: 'plan_premium' },
            },
          },
        }),
      );

      // Set while the row is still monthly, before it takes the interval.
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_moved', billingInterval: 'month' },
        data: { yearlyStartedAt: new Date(start * 1000) },
      });
      expect(
        vi.mocked(prisma.platformSubscription.updateMany).mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(prisma.platformSubscription.upsert).mock
          .invocationCallOrder[0],
      );
      expect(prisma.platformSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            billingInterval: 'year',
            periodPriceCents: 9990,
          }),
          create: expect.objectContaining({
            billingInterval: 'year',
            periodPriceCents: 9990,
          }),
        }),
      );
    });

    it('2a2. never starts new 14 days for a plan bought yearly at checkout', async () => {
      const start = Math.floor(Date.now() / 1000);
      stripeService.getSubscription.mockResolvedValue({
        id: 'sub_year',
        status: 'active',
        cancel_at_period_end: false,
        metadata: {},
        items: {
          data: [
            {
              current_period_start: start,
              current_period_end: start + 365 * 86400,
              price: { unit_amount: 9990, recurring: { interval: 'year' } },
            },
          ],
        },
      });
      prisma.platformPlan.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'plan_premium', name: 'Premium' });
      prisma.platformSubscription.updateMany = vi
        .fn()
        .mockResolvedValue({ count: 1 });

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_sub_year',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_sub_year',
              amount_total: 9990,
              currency: 'eur',
              subscription: 'sub_year',
              metadata: { userId: 'user1', planId: 'plan_premium' },
            },
          },
        }),
      );

      const yearlyStart = vi
        .mocked(prisma.platformSubscription.updateMany)
        .mock.calls.find(
          ([args]) =>
            (args as { data?: Record<string, unknown> }).data
              ?.yearlyStartedAt !== undefined,
        );
      expect(yearlyStart).toBeUndefined();
    });

    it('2b. records Edits Studio Pro as an add-on, weighed only against another add-on, never the plan beside it', async () => {
      stripeService.getSubscription.mockResolvedValue({
        status: 'active',
        items: {
          data: [
            {
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            },
          ],
        },
        cancel_at_period_end: false,
      });
      prisma.platformPlan.findUnique = vi.fn().mockResolvedValue({
        id: 'plan_studio',
        name: 'Edits Studio Pro',
      });
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'user1', email: 'user1@test.com' });
      prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([]);

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_studio',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_studio',
              amount_total: 799,
              currency: 'eur',
              subscription: 'sub_studio',
              metadata: { userId: 'user1', planId: 'plan_studio' },
            },
          },
        }),
      );

      expect(prisma.platformSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ profileId: 'prof_1', addOn: true }),
        }),
      );
      expect(prisma.platformSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ addOn: true }),
        }),
      );
    });

    it('2c. stops the add-on renewing when a plan that includes it ends up running beside it', async () => {
      stripeService.getSubscription.mockResolvedValue({
        status: 'active',
        items: {
          data: [
            {
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            },
          ],
        },
        cancel_at_period_end: false,
      });
      prisma.platformPlan.findUnique = vi.fn().mockResolvedValue({
        id: 'plan_elite',
        name: 'Elite Creator',
      });
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'user1', email: 'user1@test.com' });
      prisma.platformSubscription.count = vi.fn().mockResolvedValue(1);
      prisma.platformSubscription.findMany = vi
        .fn()
        // Older plans of the Profile: none.
        .mockResolvedValueOnce([])
        // The add-on still renewing.
        .mockResolvedValueOnce([
          { id: 'sub_addon', stripeSubscriptionId: 'stripe_addon' },
        ]);
      prisma.platformSubscription.update = vi.fn().mockResolvedValue({});

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_race',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_race',
              amount_total: 1999,
              currency: 'eur',
              subscription: 'sub_elite',
              metadata: { userId: 'user1', planId: 'plan_elite' },
            },
          },
        }),
      );

      // Ends with the period paid, never at once.
      expect(stripeService.cancelSubscription).toHaveBeenCalledWith(
        'stripe_addon',
        true,
      );
      expect(prisma.platformSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub_addon' },
        data: { cancelAtPeriodEnd: true },
      });
    });

    it('2d. a failure stopping the add-on does not fail the recording of the plan', async () => {
      stripeService.getSubscription.mockResolvedValue({
        status: 'active',
        items: {
          data: [
            {
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 2592000,
            },
          ],
        },
        cancel_at_period_end: false,
      });
      prisma.platformPlan.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'plan_elite', name: 'Elite Creator' });
      prisma.user.findUnique = vi.fn().mockResolvedValue(null);
      prisma.platformSubscription.count = vi.fn().mockResolvedValue(1);
      prisma.platformSubscription.findMany = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'sub_addon', stripeSubscriptionId: 'stripe_addon' },
        ]);
      stripeService.cancelSubscription.mockRejectedValueOnce(new Error('down'));

      await expect(
        service.processWebhookEvent(
          asEvent({
            id: 'evt_race2',
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_race2',
                amount_total: 1999,
                currency: 'eur',
                subscription: 'sub_elite2',
                metadata: { userId: 'user1', planId: 'plan_elite' },
              },
            },
          }),
        ),
      ).resolves.not.toThrow();
      expect(prisma.platformSubscription.upsert).toHaveBeenCalled();
    });

    it('2a. records the plan for the Profile the checkout names, looked for among those of the person, and records nothing without one', async () => {
      const event = (id: string) => ({
        id,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: `cs_${id}`,
            amount_total: 1000,
            currency: 'eur',
            subscription: `sub_${id}`,
            metadata: {
              userId: 'user1',
              planId: 'plan_elite',
              profileId: 'prof_named',
            },
          },
        },
      });
      stripeService.getSubscription.mockResolvedValue({
        status: 'active',
        items: {
          data: [{ current_period_start: 1, current_period_end: 2 }],
        },
        cancel_at_period_end: false,
      });
      prisma.profile.findFirst = vi
        .fn()
        .mockResolvedValue({ id: 'prof_named' });

      await service.processWebhookEvent(asEvent(event('evt_named')));

      expect(prisma.profile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user1', id: 'prof_named' },
        }),
      );
      expect(prisma.platformSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ profileId: 'prof_named' }),
          update: expect.objectContaining({ profileId: 'prof_named' }),
        }),
      );

      // A Profile that is not the person's is not found: nothing is recorded.
      vi.mocked(prisma.platformSubscription.upsert).mockClear();
      prisma.profile.findFirst = vi.fn().mockResolvedValue(null);
      await service.processWebhookEvent(asEvent(event('evt_foreign')));
      expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
    });

    describe('a second plan paid for a Profile that holds one (two tabs)', () => {
      const secondPlan = (id: string) =>
        asEvent({
          id,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: `cs_${id}`,
              amount_total: 1999,
              currency: 'eur',
              subscription: 'sub_second',
              metadata: {
                userId: 'user1',
                planId: 'plan_business',
                profileId: 'prof_1',
              },
            },
          },
        });
      const atProvider = (status: string) => ({
        status,
        items: {
          data: [{ current_period_start: 1000, current_period_end: 2000 }],
        },
        cancel_at_period_end: false,
      });

      beforeEach(() => {
        prisma.profile.findFirst = vi.fn().mockResolvedValue({ id: 'prof_1' });
        prisma.platformPlan.findUnique = vi
          .fn()
          .mockResolvedValue({ id: 'plan_business', name: 'Business' });
        prisma.platformSubscription.findMany = vi
          .fn()
          .mockResolvedValue([{ stripeSubscriptionId: 'sub_held' }]);
        stripeService.latestPaidInvoice.mockResolvedValue({
          paymentIntentId: 'pi_second',
          paidCents: 1999,
          totalCents: 1999,
        });
        stripeService.endDuplicateSubscription = vi
          .fn()
          .mockResolvedValue(undefined);
      });

      it('ends the new one and pays it back in full; the plan held stays and nothing is recorded', async () => {
        stripeService.getSubscription.mockResolvedValue(atProvider('active'));

        await service.processWebhookEvent(secondPlan('evt_second'));

        // Counted against the Profile's plans, an overdue one included.
        expect(prisma.platformSubscription.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              profileId: 'prof_1',
              addOn: false,
              status: {
                in: [
                  SubscriptionStatus.ACTIVE,
                  SubscriptionStatus.TRIALING,
                  SubscriptionStatus.PAST_DUE,
                ],
              },
              NOT: { stripeSubscriptionId: 'sub_second' },
            }),
          }),
        );
        expect(stripeService.endDuplicateSubscription).toHaveBeenCalledWith(
          'sub_second',
        );
        expect(stripeService.refundSubscriptionPayment).toHaveBeenCalledWith({
          paymentIntentId: 'pi_second',
          amountInCents: 1999,
          idempotencyKey: 'duplicate_plan_sub_second',
          metadata: {
            reason: 'duplicate_plan',
            platformSubscriptionId: 'sub_second',
          },
        });
        // The plan held is never cancelled.
        expect(stripeService.cancelSubscription).not.toHaveBeenCalled();
        expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
        expect(emailService.sendSubscriptionReceipt).not.toHaveBeenCalled();
        // The team is told, with nothing owed by them.
        expect(sentry.captureMessage).toHaveBeenCalledWith(
          expect.stringContaining(
            'sub_second of profile prof_1: ended and refunded',
          ),
          expect.objectContaining({
            extra: expect.objectContaining({ owedByStaffCents: 0 }),
          }),
        );
      });

      it.each(['unpaid', 'paused'])(
        'counts a held plan the provider holds as %s as standing',
        async (status) => {
          stripeService.getSubscription.mockImplementation(
            async (id: string) =>
              id === 'sub_held'
                ? { id, ...atProvider(status) }
                : { id, ...atProvider('active') },
          );

          await service.processWebhookEvent(secondPlan(`evt_${status}`));

          expect(stripeService.endDuplicateSubscription).toHaveBeenCalledWith(
            'sub_second',
          );
          expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
        },
      );

      it('refunds on a retry a duplicate already ended and marked, whatever the Profile holds by then', async () => {
        // The held plan was withdrawn meanwhile: nothing stands any more.
        prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([]);
        stripeService.getSubscription.mockResolvedValue({
          ...atProvider('canceled'),
          metadata: { duplicate_plan: 'true' },
        });

        await service.processWebhookEvent(secondPlan('evt_retry'));

        expect(stripeService.endDuplicateSubscription).not.toHaveBeenCalled();
        expect(stripeService.refundSubscriptionPayment).toHaveBeenCalledWith(
          expect.objectContaining({ paymentIntentId: 'pi_second' }),
        );
        expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
      });

      it('tells the team what the customer balance paid, which no card refund returns', async () => {
        stripeService.getSubscription.mockResolvedValue(atProvider('active'));
        stripeService.latestPaidInvoice.mockResolvedValue({
          paymentIntentId: null,
          paidCents: 0,
          totalCents: 1999,
        });

        await service.processWebhookEvent(secondPlan('evt_balance'));

        expect(stripeService.refundSubscriptionPayment).not.toHaveBeenCalled();
        expect(sentry.captureMessage).toHaveBeenCalledWith(
          expect.stringContaining(
            '1999 cents paid from the customer balance are owed by staff',
          ),
          expect.objectContaining({
            extra: expect.objectContaining({ owedByStaffCents: 1999 }),
          }),
        );
      });

      it('skips a held row with no provider subscription, and one the provider does not hold', async () => {
        prisma.platformSubscription.findMany = vi
          .fn()
          .mockResolvedValue([
            { stripeSubscriptionId: null },
            { stripeSubscriptionId: 'sub_gone' },
          ]);
        stripeService.getSubscription.mockImplementation(async (id: string) => {
          if (id === 'sub_gone') {
            throw Object.assign(new Error('No such subscription'), {
              type: 'StripeInvalidRequestError',
            });
          }
          return { id, ...atProvider('active') };
        });

        await service.processWebhookEvent(secondPlan('evt_gone'));

        expect(stripeService.endDuplicateSubscription).not.toHaveBeenCalled();
        expect(prisma.platformSubscription.upsert).toHaveBeenCalled();
      });

      it('records the new plan when the provider has already ended the one held', async () => {
        stripeService.getSubscription.mockImplementation(async (id: string) =>
          id === 'sub_held'
            ? { id, ...atProvider('canceled') }
            : { id, ...atProvider('active') },
        );

        await service.processWebhookEvent(secondPlan('evt_stale'));

        // The row held is brought up to date from the provider.
        expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              stripeSubscriptionId: 'sub_held',
            }),
            data: expect.objectContaining({
              status: SubscriptionStatus.CANCELLED,
            }),
          }),
        );
        expect(stripeService.endDuplicateSubscription).not.toHaveBeenCalled();
        expect(stripeService.refundSubscriptionPayment).not.toHaveBeenCalled();
        expect(prisma.platformSubscription.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { stripeSubscriptionId: 'sub_second' },
          }),
        );
      });

      it('fails the notice when the refund fails, so the provider sends it again', async () => {
        stripeService.getSubscription.mockResolvedValue(atProvider('active'));
        stripeService.refundSubscriptionPayment.mockRejectedValueOnce(
          new Error('down'),
        );

        await expect(
          service.processWebhookEvent(secondPlan('evt_refund_down')),
        ).rejects.toThrow('down');
        expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
      });
    });

    it('2c. ignores checkout.session.completed when subscription metadata is missing', async () => {
      const event = {
        id: 'evt_missing_meta',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_nometa',
            metadata: {},
            subscription: null,
          },
        },
      };

      await service.processWebhookEvent(asEvent(event));
      expect(stripeService.getSubscription).not.toHaveBeenCalled();
    });

    it('3. should handle customer.subscription.updated', async () => {
      const event = {
        id: 'evt_sub_upd_1',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_456',
            status: 'past_due',
            items: {
              data: [
                {
                  current_period_start: 1_796_061_164,
                  current_period_end: 1_798_653_164,
                },
              ],
            },
            cancel_at_period_end: false,
          },
        },
      };

      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
        userId: 'user1',
        stripeSubscriptionId: 'sub_456',
      });

      stripeService.getSubscription.mockResolvedValue(event.data.object);
      await service.processWebhookEvent(asEvent(event));

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: written('sub_456'),
        data: {
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodStart: new Date(1_796_061_164_000),
          currentPeriodEnd: new Date(1_798_653_164_000),
          cancelAtPeriodEnd: false,
        },
      });

      expect(usersService.syncUserTier).toHaveBeenCalledWith('user1');
    });

    it("a late notice of a cancellation does not undo a resumption: the provider's current state is written", async () => {
      const period = {
        items: {
          data: [
            {
              current_period_start: 1_796_061_164,
              current_period_end: 1_798_653_164,
            },
          ],
        },
      };
      const event = {
        id: 'evt_sub_late',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_late',
            status: 'active',
            cancel_at_period_end: true,
            ...period,
          },
        },
      };
      // Since the notice was sent, the plan was resumed.
      stripeService.getSubscription.mockResolvedValue({
        id: 'sub_late',
        status: 'active',
        cancel_at_period_end: false,
        ...period,
      });
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      await service.processWebhookEvent(asEvent(event));

      expect(stripeService.getSubscription).toHaveBeenCalledWith('sub_late');
      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: written('sub_late'),
        data: expect.objectContaining({ cancelAtPeriodEnd: false }),
      });
    });

    it("when the provider does not hold the subscription here, the notice's own copy is written", async () => {
      const event = {
        id: 'evt_sub_fallback',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_fb',
            status: 'active',
            cancel_at_period_end: true,
            items: {
              data: [
                {
                  current_period_start: 1_796_061_164,
                  current_period_end: 1_798_653_164,
                },
              ],
            },
          },
        },
      };
      stripeService.getSubscription.mockRejectedValue(
        Object.assign(new Error('No such subscription'), {
          type: 'StripeInvalidRequestError',
        }),
      );
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      await service.processWebhookEvent(asEvent(event));

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: written('sub_fb'),
        data: expect.objectContaining({ cancelAtPeriodEnd: true }),
      });
    });

    it('when the provider cannot be reached, nothing is written and the notice is tried again', async () => {
      const event = {
        id: 'evt_sub_transient',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_tr',
            status: 'active',
            cancel_at_period_end: true,
            items: {
              data: [
                {
                  current_period_start: 1_796_061_164,
                  current_period_end: 1_798_653_164,
                },
              ],
            },
          },
        },
      };
      stripeService.getSubscription.mockRejectedValue(
        Object.assign(new Error('socket hang up'), {
          type: 'StripeConnectionError',
        }),
      );
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      await expect(service.processWebhookEvent(asEvent(event))).rejects.toThrow(
        'socket hang up',
      );
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: written('sub_tr'),
        }),
      );
    });

    it('a subscription event with no billing period on its item is refused and writes nothing', async () => {
      const event = {
        id: 'evt_sub_no_item',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_no_item',
            status: 'active',
            current_period_end: 2,
            cancel_at_period_end: false,
          },
        },
      };

      stripeService.getSubscription.mockResolvedValue(event.data.object);
      await expect(service.processWebhookEvent(asEvent(event))).rejects.toThrow(
        'Subscription sub_no_item has no billing period',
      );
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalled();
      expect(usersService.syncUserTier).not.toHaveBeenCalled();
    });

    it('4. should handle customer.subscription.deleted', async () => {
      const event = {
        id: 'evt_sub_del_1',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_789',
            status: 'canceled',
            items: {
              data: [
                {
                  current_period_start: 0,
                  current_period_end: Math.floor(Date.now() / 1000),
                },
              ],
            },
            cancel_at_period_end: false,
          },
        },
      };

      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
        userId: 'user2',
        stripeSubscriptionId: 'sub_789',
      });

      stripeService.getSubscription.mockResolvedValue(event.data.object);
      await service.processWebhookEvent(asEvent(event));

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: written('sub_789'),
        data: expect.objectContaining({ status: SubscriptionStatus.CANCELLED }),
      });

      expect(usersService.syncUserTier).toHaveBeenCalledWith('user2');
    });

    it('6. should handle identity.verification_session.verified', async () => {
      const event = {
        id: 'evt_kyc_1',
        type: 'identity.verification_session.verified',
        data: {
          object: {
            metadata: { userId: 'user3' },
            verified_outputs: {
              dob: { year: 1990, month: 5, day: 15 },
            },
          },
        },
      };

      await service.processWebhookEvent(asEvent(event));

      expect(usersService.handleIdentityWebhook).toHaveBeenCalledWith(
        event.data.object,
      );
    });

    describe('invoice.payment_failed', () => {
      const failed = asEvent({
        id: 'evt_inv_fail',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_123',
            parent: { subscription_details: { subscription: 'sub_fail' } },
          },
        },
      });
      const atProvider = (status: string) => ({
        id: 'sub_fail',
        status,
        cancel_at_period_end: false,
        items: {
          data: [{ current_period_start: 1000, current_period_end: 2000 }],
        },
      });
      beforeEach(() => {
        prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
          userId: 'u_fail',
        });
      });
      const statusWritten = () =>
        vi
          .mocked(prisma.platformSubscription.updateMany)
          .mock.calls.map(
            ([args]) => (args as { data: { status?: string } }).data.status,
          )
          .filter(Boolean);

      it('takes the overdue state the provider holds after a failed renewal', async () => {
        stripeService.getSubscription.mockResolvedValue(atProvider('past_due'));

        await service.processWebhookEvent(failed);

        expect(stripeService.getSubscription).toHaveBeenCalledWith('sub_fail');
        expect(statusWritten()).toContain(SubscriptionStatus.PAST_DUE);
        expect(usersService.syncUserTier).toHaveBeenCalledWith('u_fail');
      });

      it('keeps a plan active, with its benefits, when only the charge of a move to the yearly price was declined', async () => {
        // pending_if_incomplete: the provider keeps the plan active at its
        // monthly price.
        stripeService.getSubscription.mockResolvedValue(atProvider('active'));

        await service.processWebhookEvent(failed);

        expect(statusWritten()).toEqual(
          expect.arrayContaining([SubscriptionStatus.ACTIVE]),
        );
        expect(statusWritten()).not.toContain(SubscriptionStatus.PAST_DUE);
        expect(usersService.syncUserTier).toHaveBeenCalledWith('u_fail');
      });

      it('leaves a withdrawn plan ended', async () => {
        stripeService.getSubscription.mockResolvedValue(atProvider('past_due'));

        await service.processWebhookEvent(failed);

        expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
          where: {
            stripeSubscriptionId: 'sub_fail',
            withdrawnAt: { not: null },
            status: { not: SubscriptionStatus.CANCELLED },
          },
          data: { status: SubscriptionStatus.CANCELLED },
        });
      });
    });

    it('applies nothing for a failed invoice of a subscription the provider does not hold', async () => {
      stripeService.getSubscription.mockRejectedValue(
        Object.assign(new Error('No such subscription'), {
          type: 'StripeInvalidRequestError',
        }),
      );

      await expect(
        service.processWebhookEvent(
          asEvent({
            id: 'evt_inv_gone',
            type: 'invoice.payment_failed',
            data: {
              object: {
                id: 'in_gone',
                parent: { subscription_details: { subscription: 'sub_gone' } },
              },
            },
          }),
        ),
      ).resolves.toBeUndefined();
      expect(prisma.platformSubscription.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stripeSubscriptionId: 'sub_gone' }),
        }),
      );
    });

    it('9. should handle unknown event gracefully', async () => {
      const event = {
        id: 'evt_unknown',
        type: 'unknown.event.type',
        data: {},
      };

      await expect(
        service.processWebhookEvent(asEvent(event)),
      ).resolves.toBeUndefined();
      expect(prisma.webhookEvent.upsert).toHaveBeenCalled();
    });

    it('throws when the notice cannot be recorded, so the provider sends it again', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue(null);
      prisma.webhookEvent.upsert = vi
        .fn()
        .mockRejectedValue(new Error('DB connection drop'));

      await expect(
        service.processWebhookEvent(
          asEvent({ id: 'evt_db_err', type: 'charge.succeeded', data: {} }),
        ),
      ).rejects.toThrow('DB connection drop');
    });

    it('safely catches error when marking webhook FAILED fails during dispatch error', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue(null);
      prisma.webhookEvent.create = vi.fn().mockResolvedValue({});
      prisma.webhookEvent.update = vi
        .fn()
        .mockRejectedValue(new Error('Secondary update error'));

      await expect(
        service.processWebhookEvent(
          asEvent({
            id: 'evt_dispatch_fail',
            type: 'checkout.session.completed',
            data: { object: { metadata: { type: 'PROMOTION' } } },
          }),
        ),
      ).rejects.toThrow();
    });

    it('handles email receipt failure in platform subscription checkout without failing the webhook', async () => {
      emailService.sendSubscriptionReceipt = vi
        .fn()
        .mockRejectedValue(new Error('Email service error'));
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'u_sub', email: 'sub@test.com' });
      prisma.platformPlan.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'p_sub', name: 'VIP Plan' });
      stripeService.getSubscription = vi.fn().mockResolvedValue({
        status: 'active',
        items: {
          data: [
            {
              current_period_start: 1_700_000_000,
              current_period_end: 1_702_592_000,
            },
          ],
        },
        cancel_at_period_end: false,
      });

      await expect(
        service.processWebhookEvent(
          asEvent({
            id: 'evt_sub_notif_err',
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_sub_notif',
                subscription: 'sub_stripe_1',
                amount_total: 1999,
                metadata: {
                  userId: 'u_sub',
                  planId: 'p_sub',
                  billingCycle: 'MONTHLY',
                },
              },
            },
          }),
        ),
      ).resolves.toBeUndefined();
    });

    it('hands a refund to the refund rules, never to the dispute ones', async () => {
      const charge = {
        payment_intent: 'pi_route',
        amount: 1000,
        amount_refunded: 500,
      };

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_refund_route',
          type: 'charge.refunded',
          data: { object: charge },
        }),
      );

      expect(paymentEvents.handleChargeRefunded).toHaveBeenCalledWith(charge);
      expect(paymentEvents.syncDispute).not.toHaveBeenCalled();
      expect(paymentEvents.applyDisputeToPayment).not.toHaveBeenCalled();
    });

    it('mirrors a dispute when it is created, updated and closed, then applies it to its payment', async () => {
      const dispute = { id: 'dp_1', payment_intent: 'pi_route', amount: 999 };

      for (const type of [
        'charge.dispute.created',
        'charge.dispute.updated',
        'charge.dispute.closed',
      ]) {
        await service.processWebhookEvent(
          asEvent({ id: `evt_${type}`, type, data: { object: dispute } }),
        );
      }

      expect(paymentEvents.syncDispute).toHaveBeenCalledTimes(3);
      expect(paymentEvents.syncDispute).toHaveBeenCalledWith(
        dispute,
        expect.any(Function),
      );
      expect(paymentEvents.applyDisputeToPayment).toHaveBeenCalledTimes(3);
      // The payment follows the dispute only once the dispute is mirrored.
      expect(
        paymentEvents.syncDispute.mock.invocationCallOrder[0],
      ).toBeLessThan(
        paymentEvents.applyDisputeToPayment.mock.invocationCallOrder[0],
      );
      expect(paymentEvents.handleChargeRefunded).not.toHaveBeenCalled();
    });

    it('offers the mirror who was charged, read from the provider, and nobody when it cannot be read', async () => {
      const send = (object: Record<string, unknown>) =>
        service.processWebhookEvent(
          asEvent({
            id: `evt_${String(object.id)}`,
            type: 'charge.dispute.updated',
            data: { object },
          }),
        );
      const asked = (call: number) =>
        (
          paymentEvents.syncDispute.mock.calls[call][1] as () => Promise<
            string | undefined
          >
        )();

      stripeService.getChargeCustomerId.mockResolvedValueOnce('cus_1');
      await send({ id: 'dp_a', amount: 1, charge: 'ch_a' });
      // Nothing is read until the mirror asks.
      expect(stripeService.getChargeCustomerId).not.toHaveBeenCalled();
      await expect(asked(0)).resolves.toBe('cus_1');
      expect(stripeService.getChargeCustomerId).toHaveBeenCalledWith('ch_a');

      stripeService.getChargeCustomerId.mockRejectedValueOnce(
        new Error('provider down'),
      );
      await send({ id: 'dp_b', amount: 1, charge: { id: 'ch_b' } });
      await expect(asked(1)).resolves.toBeUndefined();
      expect(stripeService.getChargeCustomerId).toHaveBeenLastCalledWith(
        'ch_b',
      );

      await send({ id: 'dp_c', amount: 1 });
      await expect(asked(2)).resolves.toBeUndefined();
      expect(stripeService.getChargeCustomerId).toHaveBeenCalledTimes(2);
    });

    it('delegates checkout.session.expired to paymentEvents.handleCheckoutSessionExpired', async () => {
      const session = {
        id: 'cs_exp_route',
        metadata: { type: 'PROMOTION', promotionId: 'promo_route' },
      };

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_exp_route',
          type: 'checkout.session.expired',
          data: { object: session },
        }),
      );

      expect(paymentEvents.handleCheckoutSessionExpired).toHaveBeenCalledWith(
        session,
      );
    });

    it('delegates checkout.session.completed for promotions to paymentEvents.handleCheckoutSessionCompleted, and keeps platform subscriptions inline', async () => {
      const promotionSession = {
        id: 'cs_route',
        metadata: { type: 'PROMOTION', promotionId: 'promo_route' },
      };
      await service.processWebhookEvent(
        asEvent({
          id: 'evt_route_promotion',
          type: 'checkout.session.completed',
          data: { object: promotionSession },
        }),
      );
      expect(paymentEvents.handleCheckoutSessionCompleted).toHaveBeenCalledWith(
        promotionSession,
      );

      paymentEvents.handleCheckoutSessionCompleted.mockClear();
      await service.processWebhookEvent(
        asEvent({
          id: 'evt_route_subscription',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_sub_route',
              metadata: {},
              subscription: null,
            },
          },
        }),
      );
      expect(
        paymentEvents.handleCheckoutSessionCompleted,
      ).not.toHaveBeenCalled();
    });

    it("ignores a checkout made on another account than CircleSfera's", async () => {
      const warn = vi
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => {});

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_route_foreign',
          type: 'checkout.session.completed',
          account: 'acct_other',
          data: {
            object: {
              id: 'cs_foreign',
              metadata: { type: 'PROMOTION', planId: 'p' },
            },
          },
        }),
      );

      expect(
        paymentEvents.handleCheckoutSessionCompleted,
      ).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        "Checkout cs_foreign on account acct_other is not CircleSfera's; ignored",
      );
    });
  });
});
