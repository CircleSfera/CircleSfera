import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import { MonetizationWebhookService } from '../monetization/monetization-webhook.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { PaymentsService, planAccountType } from './payments.service.js';

const asEvent = (event: unknown) => event as unknown as Stripe.Event;

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let emailService: any;
  let stripeService: any;
  let usersService: any;
  let monetizationWebhookService: {
    handleCheckoutSessionCompleted: ReturnType<typeof vi.fn>;
    handleCheckoutSessionExpired: ReturnType<typeof vi.fn>;
    handleChargeRefundedOrDisputed: ReturnType<typeof vi.fn>;
    syncDispute: ReturnType<typeof vi.fn>;
    syncConnectPayoutLog: ReturnType<typeof vi.fn>;
    handleAccountUpdated: ReturnType<typeof vi.fn>;
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
              update: vi.fn().mockResolvedValue({}),
              updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            postUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            storyUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            messageUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            transaction: {
              create: vi.fn(),
              findUnique: vi.fn(),
              findMany: vi.fn().mockResolvedValue([]),
              update: vi.fn(),
            },
            monetization: { upsert: vi.fn() },
            stripePayoutLog: { upsert: vi.fn() },
            promotion: { update: vi.fn(), updateMany: vi.fn() },
            platformSubscription: {
              upsert: vi.fn(),
              updateMany: vi.fn(),
              findFirst: vi.fn(),
              findMany: vi.fn().mockResolvedValue([]),
              update: vi.fn(),
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
            createCustomer: vi.fn(),
            createCheckoutSession: vi.fn(),
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
            sendTipReceivedEmail: vi.fn(),
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
          provide: MonetizationWebhookService,
          useValue: {
            handleCheckoutSessionCompleted: vi
              .fn()
              .mockResolvedValue(undefined),
            handleCheckoutSessionExpired: vi.fn().mockResolvedValue(undefined),
            handleChargeRefundedOrDisputed: vi
              .fn()
              .mockResolvedValue(undefined),
            syncDispute: vi.fn().mockResolvedValue(undefined),
            syncConnectPayoutLog: vi.fn().mockResolvedValue(undefined),
            handleAccountUpdated: vi.fn().mockResolvedValue(undefined),
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
    monetizationWebhookService = module.get(MonetizationWebhookService);
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
      type: 'DIRECT_TIP',
      amount: 500,
      currency: 'EUR',
      status: 'COMPLETED',
      senderId: 'user_1',
      receiverId: 'user_2',
      description: 'A "special" tip',
      // 5 € plus 21% VAT.
      vatCents: 105,
      ...over,
    });

    it('gives a person their own record, in euros, saying what they sent and what they received', async () => {
      prisma.transaction.findMany = vi.fn().mockResolvedValue([
        tx({}),
        tx({
          id: 'tx_2',
          type: 'DIRECT_UNLOCK',
          amount: 1999,
          vatCents: 0,
          senderId: 'user_3',
          receiverId: 'user_1',
          description: null,
        }),
      ]);

      const csv = await service.getLedgerCsv('user_1');

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { OR: [{ senderId: 'user_1' }, { receiverId: 'user_1' }] },
        orderBy: { createdAt: 'desc' },
      });
      expect(csv.split('\n')).toEqual([
        'ID,Date,Type,Direction,Amount,VAT,Currency,Status,Description',
        '"tx_1","2026-01-01T00:00:00.000Z","DIRECT_TIP","SENT","5.00","1.05","EUR","COMPLETED","A ""special"" tip"',
        '"tx_2","2026-01-01T00:00:00.000Z","DIRECT_UNLOCK","RECEIVED","19.99","0.00","EUR","COMPLETED",""',
      ]);
    });

    it("never names the other party in a person's own record", async () => {
      prisma.transaction.findMany = vi.fn().mockResolvedValue([
        tx({
          sender: { email: 'sender@test.com' },
          receiver: { email: 'receiver@test.com' },
        }),
      ]);

      const csv = await service.getLedgerCsv('user_1');

      expect(csv).not.toContain('@test.com');
      expect(csv).not.toContain('user_2');
    });

    it('gives staff every transaction with who sent and received it, in euros', async () => {
      prisma.transaction.findMany = vi.fn().mockResolvedValue([
        tx({
          sender: { email: 'sender@test.com' },
          receiver: { email: 'receiver@test.com' },
        }),
        tx({
          id: 'tx_2',
          type: 'PROMOTION_PAYMENT',
          amount: 1000,
          vatCents: 0,
          sender: null,
          receiver: null,
          description: null,
        }),
      ]);

      const csv = await service.getLedgerCsv();

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: { email: true } },
          receiver: { select: { email: true } },
        },
      });
      expect(csv.split('\n')).toEqual([
        'ID,Date,Type,Amount,VAT,Currency,Status,Sender,Receiver,Description',
        '"tx_1","2026-01-01T00:00:00.000Z","DIRECT_TIP","5.00","1.05","EUR","COMPLETED","sender@test.com","receiver@test.com","A ""special"" tip"',
        '"tx_2","2026-01-01T00:00:00.000Z","PROMOTION_PAYMENT","10.00","0.00","EUR","COMPLETED","SYSTEM","SYSTEM",""',
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
            tx({ description: text, sender: { email: text }, receiver: null }),
          ]);

        // Whole files: a text may hold a line break of its own.
        const own = await service.getLedgerCsv('user_1');
        const staff = await service.getLedgerCsv();

        const quoted = `"'${text.replace(/"/g, '""')}"`;
        expect(own.endsWith(`"COMPLETED",${quoted}`)).toBe(true);
        expect(staff).toContain(`"COMPLETED",${quoted},"SYSTEM",${quoted}`);
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
            profileId: 'prof_1',
            status: SubscriptionStatus.ACTIVE,
          },
        ],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
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
            profileId: 'prof_1',
            status: SubscriptionStatus.ACTIVE,
          },
        ],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
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
        id: 'plan_1',
        stripePriceId: 'price_monthly',
        yearlyStripePriceId: null,
      });

      await expect(
        service.createCheckout('u_1', 'plan_1', 'YEARLY', 'prof_1'),
      ).rejects.toThrow('Billing cycle YEARLY is not available for this plan');
    });

    it('deduplicates in-flight checkout requests for the same user, plan and cycle', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_flight',
        email: 'flight@test.com',
        stripeCustomerId: 'cust_flight',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
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
          idempotencyKey: 'checkout_sub_tax_u_year:prof_1:plan_1:YEARLY',
        }),
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
      currentPeriodStart: new Date('2026-10-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-11-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      plan: { id: 'plan_pro', name: 'Pro', priceCents: 2000, currency: 'EUR' },
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
  });

  describe('getBillingStatus', () => {
    it('returns hasActiveSubscription: true for ACTIVE subscription', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
        id: 'sub_1',
        planId: 'plan_pro',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-02-01'),
        cancelAtPeriodEnd: false,
        plan: {
          id: 'plan_pro',
          name: 'Pro',
          priceCents: 2000,
          currency: 'EUR',
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
        plan: { name: 'Pro', priceCents: 2000, currency: 'EUR' },
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

  describe('reconcileStuckWebhookEvents', () => {
    it('returns 0 when no stuck events are found', async () => {
      prisma.webhookEvent.findMany = vi.fn().mockResolvedValue([]);
      const count = await service.reconcileStuckWebhookEvents();
      expect(count).toBe(0);
    });

    it('skips event when another worker claimed the lease (count === 0)', async () => {
      prisma.webhookEvent.findMany = vi
        .fn()
        .mockResolvedValue([
          { id: 'wh_1', externalId: 'evt_1', updatedAt: new Date(0) },
        ]);
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 0 });

      const count = await service.reconcileStuckWebhookEvents();
      expect(count).toBe(0);
    });

    it('reconciles stuck event and marks PROCESSED', async () => {
      prisma.webhookEvent.findMany = vi.fn().mockResolvedValue([
        {
          id: 'wh_1',
          externalId: 'evt_1',
          payload: { id: 'evt_1', type: 'unknown.event', data: {} },
          updatedAt: new Date(0),
        },
      ]);
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 1 });
      prisma.webhookEvent.update = vi.fn().mockResolvedValue({});

      const count = await service.reconcileStuckWebhookEvents();
      expect(count).toBe(1);
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh_1' },
          data: expect.objectContaining({ status: 'PROCESSED' }),
        }),
      );
    });

    it('marks FAILED when dispatchStripeEvent fails during reconciliation', async () => {
      prisma.webhookEvent.findMany = vi.fn().mockResolvedValue([
        {
          id: 'wh_err',
          externalId: 'evt_err',
          payload: {
            id: 'evt_err',
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_unpaid',
                mode: 'payment',
                payment_status: 'unpaid',
              },
            },
          },
          updatedAt: new Date(0),
        },
      ]);
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 1 });
      prisma.webhookEvent.update = vi.fn().mockResolvedValue({});

      const count = await service.reconcileStuckWebhookEvents();
      expect(count).toBe(0);
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { id: 'wh_err' },
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
      monetizationWebhookService.handleCheckoutSessionCompleted = vi
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
      expect(
        monetizationWebhookService.handleCheckoutSessionCompleted,
      ).toHaveBeenCalled();
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith({
        where: { externalId: 'evt_retry' },
        data: { status: 'PROCESSED', processedAt: expect.any(Date) },
      });
    });

    it('1d. recovers expired lease for PENDING events or skips if lease is active', async () => {
      // Case 1: lease is still active (updatedAt is very recent)
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue({
        status: 'PENDING',
        externalId: 'evt_active_lease',
        updatedAt: new Date(),
      });
      await service.processWebhookEvent(
        asEvent({
          id: 'evt_active_lease',
          type: 'checkout.session.completed',
          data: {},
        }),
      );
      expect(prisma.webhookEvent.updateMany).not.toHaveBeenCalled();

      // Case 2: lease is expired (updatedAt older than 2 minutes)
      const oldTime = new Date(Date.now() - 3 * 60 * 1000);
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue({
        status: 'PENDING',
        externalId: 'evt_expired_lease',
        updatedAt: oldTime,
      });
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 1 });
      await service
        .processWebhookEvent(
          asEvent({
            id: 'evt_expired_lease',
            type: 'checkout.session.completed',
            data: {
              object: {
                id: 'cs_unpaid',
                mode: 'payment',
                payment_status: 'unpaid',
              },
            },
          }),
        )
        .catch(() => {});
      expect(prisma.webhookEvent.updateMany).toHaveBeenCalled();
    });

    it('1e. handles P2002 duplicate externalId collision gracefully', async () => {
      prisma.webhookEvent.findUnique = vi
        .fn()
        .mockResolvedValueOnce(null) // first check
        .mockResolvedValueOnce({ status: 'PROCESSED' }); // check after P2002
      prisma.webhookEvent.create = vi.fn().mockRejectedValue({ code: 'P2002' });

      await expect(
        service.processWebhookEvent(
          asEvent({ id: 'evt_p2002', type: 'any', data: {} }),
        ),
      ).resolves.toBeUndefined();
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
      prisma.platformSubscription.findMany = vi.fn().mockResolvedValue([
        {
          id: 'old_sub_id',
          stripeSubscriptionId: 'old_stripe_sub',
          planId: 'old_plan',
        },
      ]);
      prisma.platformSubscription.update = vi.fn().mockResolvedValue({});

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
          }),
        }),
      );
      // Only the other plans of that Profile are cancelled, and before the
      // new one is recorded.
      expect(prisma.platformSubscription.findMany).toHaveBeenCalledWith({
        where: {
          profileId: 'prof_1',
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
          NOT: { stripeSubscriptionId: 'sub_123' },
        },
      });
      expect(
        vi.mocked(prisma.platformSubscription.update).mock
          .invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(prisma.platformSubscription.upsert).mock
          .invocationCallOrder[0],
      );
      expect(usersService.syncUserTier).toHaveBeenCalledWith('user1');
      expect(stripeService.cancelSubscription).toHaveBeenCalledWith(
        'old_stripe_sub',
        false,
      );
      expect(prisma.platformSubscription.update).toHaveBeenCalledWith({
        where: { id: 'old_sub_id' },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelAtPeriodEnd: false,
        },
      });
      expect(emailService.sendSubscriptionReceipt).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.alert',
        expect.objectContaining({
          eventType: 'Platform Subscription Checkout',
        }),
      );
      expect(prisma.webhookEvent.update).toHaveBeenCalled();
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

    it('2b. gracefully handles Stripe error when cancelling previous subscription', async () => {
      const event = {
        id: 'evt_sub_err',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_sub_err',
            amount_total: 1000,
            currency: 'eur',
            subscription: 'sub_err',
            metadata: { userId: 'user1', planId: 'plan_elite' },
          },
        },
      };

      stripeService.getSubscription.mockResolvedValue({
        status: 'active',
        items: {
          data: [{ current_period_start: 1000, current_period_end: 2000 }],
        },
        cancel_at_period_end: false,
      });
      prisma.platformSubscription.findMany = vi
        .fn()
        .mockResolvedValue([
          { id: 'old_sub', stripeSubscriptionId: 'old_stripe_fail' },
        ]);
      stripeService.cancelSubscription.mockRejectedValue(
        new Error('Stripe cancel fail'),
      );

      await service.processWebhookEvent(asEvent(event));
      expect(prisma.platformSubscription.update).not.toHaveBeenCalled();
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

      await service.processWebhookEvent(asEvent(event));

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_456' },
        data: {
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodStart: new Date(1_796_061_164_000),
          currentPeriodEnd: new Date(1_798_653_164_000),
          cancelAtPeriodEnd: false,
        },
      });

      expect(usersService.syncUserTier).toHaveBeenCalledWith('user1');
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

      await service.processWebhookEvent(asEvent(event));

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_789' },
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

    it('8bf. updates subscription to PAST_DUE on invoice.payment_failed', async () => {
      const event = {
        id: 'evt_inv_fail',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_123',
            parent: { subscription_details: { subscription: 'sub_fail' } },
          },
        },
      };

      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
        userId: 'u_fail',
      });

      await service.processWebhookEvent(asEvent(event));

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_fail' },
        data: { status: SubscriptionStatus.PAST_DUE },
      });
      expect(usersService.syncUserTier).toHaveBeenCalledWith('u_fail');
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
      expect(prisma.webhookEvent.create).toHaveBeenCalled();
    });

    it('handles P2002 collision when raced status is PENDING and lease active', async () => {
      prisma.webhookEvent.findUnique = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'PENDING',
          updatedAt: new Date(Date.now() + 100000),
        });
      prisma.webhookEvent.create = vi.fn().mockRejectedValue({ code: 'P2002' });

      await service.processWebhookEvent(
        asEvent({ id: 'evt_p2002_active', type: 'charge.succeeded', data: {} }),
      );
      expect(prisma.webhookEvent.updateMany).not.toHaveBeenCalled();
    });

    it('handles P2002 collision when raced status is PENDING, lease expired, but another worker claimed it', async () => {
      prisma.webhookEvent.findUnique = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'PENDING',
          updatedAt: new Date(Date.now() - 1000000),
        });
      prisma.webhookEvent.create = vi.fn().mockRejectedValue({ code: 'P2002' });
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 0 });

      await service.processWebhookEvent(
        asEvent({ id: 'evt_p2002_lost', type: 'charge.succeeded', data: {} }),
      );
      expect(prisma.webhookEvent.updateMany).toHaveBeenCalled();
    });

    it('handles P2002 collision when raced status is FAILED and updateMany count is 0', async () => {
      prisma.webhookEvent.findUnique = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'FAILED',
          updatedAt: new Date(Date.now() - 100000),
        });
      prisma.webhookEvent.create = vi.fn().mockRejectedValue({ code: 'P2002' });
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 0 });

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_p2002_failed_lost',
          type: 'charge.succeeded',
          data: {},
        }),
      );
      expect(prisma.webhookEvent.updateMany).toHaveBeenCalled();
    });

    it('handles P2002 collision when raced status is FAILED and successfully claims it', async () => {
      prisma.webhookEvent.findUnique = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'FAILED',
          updatedAt: new Date(Date.now() - 100000),
        });
      prisma.webhookEvent.create = vi.fn().mockRejectedValue({ code: 'P2002' });
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 1 });

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_p2002_failed_won',
          type: 'charge.succeeded',
          data: {},
        }),
      );
      expect(prisma.webhookEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PROCESSED' }),
        }),
      );
    });

    it('re-throws non-P2002 errors during webhook creation', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue(null);
      prisma.webhookEvent.create = vi
        .fn()
        .mockRejectedValue(new Error('DB connection drop'));

      await expect(
        service.processWebhookEvent(
          asEvent({ id: 'evt_db_err', type: 'charge.succeeded', data: {} }),
        ),
      ).rejects.toThrow('DB connection drop');
    });

    it('returns early when existing event is FAILED but another worker claimed it', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue({
        id: 'w1',
        status: 'FAILED',
        externalId: 'evt_failed_0',
        updatedAt: new Date(),
      });
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 0 });

      await service.processWebhookEvent(
        asEvent({ id: 'evt_failed_0', type: 'charge.succeeded', data: {} }),
      );
      expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
    });

    it('returns early when existing event is PENDING with expired lease but another worker claimed it', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue({
        id: 'w2',
        status: 'PENDING',
        externalId: 'evt_pending_0',
        updatedAt: new Date(Date.now() - 1000000),
      });
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 0 });

      await service.processWebhookEvent(
        asEvent({ id: 'evt_pending_0', type: 'charge.succeeded', data: {} }),
      );
      expect(prisma.webhookEvent.update).not.toHaveBeenCalled();
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

    it('reconcileStuckWebhookEvents handles failure when update to FAILED rejects', async () => {
      prisma.webhookEvent.findMany = vi.fn().mockResolvedValue([
        {
          id: 'w_err',
          externalId: 'evt_rec_err',
          payload: {
            id: 'evt_rec_err',
            type: 'checkout.session.completed',
            data: { object: { metadata: { type: 'PROMOTION' } } },
          },
        },
      ]);
      prisma.webhookEvent.updateMany = vi.fn().mockResolvedValue({ count: 1 });
      prisma.webhookEvent.update = vi
        .fn()
        .mockRejectedValue(new Error('Update failed'));

      const res = await service.reconcileStuckWebhookEvents(10);
      expect(res).toBe(0);
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

    it('delegates payout.paid to monetizationWebhookService.syncConnectPayoutLog', async () => {
      const event = {
        id: 'evt_po_route',
        type: 'payout.paid',
        account: 'acct_1',
        data: { object: { id: 'po_route' } },
      };

      await service.processWebhookEvent(asEvent(event));

      expect(
        monetizationWebhookService.syncConnectPayoutLog,
      ).toHaveBeenCalledWith(event);
    });

    it('delegates account.updated to monetizationWebhookService.handleAccountUpdated', async () => {
      const account = {
        id: 'acct_route',
        charges_enabled: true,
        capabilities: { transfers: 'active' },
      };

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_acct_route',
          type: 'account.updated',
          data: { object: account },
        }),
      );

      expect(
        monetizationWebhookService.handleAccountUpdated,
      ).toHaveBeenCalledWith(account);
    });

    it('delegates charge.refunded and charge.dispute.created to monetizationWebhookService.handleChargeRefundedOrDisputed', async () => {
      const charge = { payment_intent: 'pi_route' };

      await service.processWebhookEvent(
        asEvent({
          id: 'evt_refund_route',
          type: 'charge.refunded',
          data: { object: charge },
        }),
      );
      await service.processWebhookEvent(
        asEvent({
          id: 'evt_dispute_route',
          type: 'charge.dispute.created',
          data: { object: charge },
        }),
      );

      expect(
        monetizationWebhookService.handleChargeRefundedOrDisputed,
      ).toHaveBeenCalledTimes(2);
    });

    it('mirrors a dispute when it is created, updated and closed, and a refund is not a dispute', async () => {
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
      await service.processWebhookEvent(
        asEvent({
          id: 'evt_refund_only',
          type: 'charge.refunded',
          data: { object: { payment_intent: 'pi_route' } },
        }),
      );

      expect(monetizationWebhookService.syncDispute).toHaveBeenCalledTimes(3);
      expect(monetizationWebhookService.syncDispute).toHaveBeenCalledWith(
        dispute,
        expect.any(Function),
      );
      // Access is revoked when the dispute opens and on the refund, not on
      // every later update of the same dispute.
      expect(
        monetizationWebhookService.handleChargeRefundedOrDisputed,
      ).toHaveBeenCalledTimes(2);
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
          monetizationWebhookService.syncDispute.mock.calls[
            call
          ][1] as () => Promise<string | undefined>
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

    it('delegates checkout.session.expired for monetization types to monetizationWebhookService.handleCheckoutSessionExpired', async () => {
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

      expect(
        monetizationWebhookService.handleCheckoutSessionExpired,
      ).toHaveBeenCalledWith(session);
    });

    it('delegates checkout.session.completed for monetization types to monetizationWebhookService.handleCheckoutSessionCompleted, and keeps platform subscriptions inline', async () => {
      const monetizationSession = {
        id: 'cs_route',
        metadata: { type: 'DIRECT_TIP', creatorId: 'creator_route' },
      };
      await service.processWebhookEvent(
        asEvent({
          id: 'evt_route_monetization',
          type: 'checkout.session.completed',
          data: { object: monetizationSession },
        }),
      );
      expect(
        monetizationWebhookService.handleCheckoutSessionCompleted,
      ).toHaveBeenCalledWith(monetizationSession);

      monetizationWebhookService.handleCheckoutSessionCompleted.mockClear();
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
        monetizationWebhookService.handleCheckoutSessionCompleted,
      ).not.toHaveBeenCalled();
    });
  });
});
