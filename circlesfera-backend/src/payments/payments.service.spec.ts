import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import { MonetizationWebhookService } from '../monetization/monetization-webhook.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { UsersService } from '../users/users.service.js';
import { PaymentsService } from './payments.service.js';

const asEvent = (event: unknown) => event as unknown as Stripe.Event;

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let slackService: SlackService;
  let emailService: any;
  let stripeService: any;
  let usersService: any;
  let monetizationWebhookService: {
    handleCheckoutSessionCompleted: ReturnType<typeof vi.fn>;
    handleCheckoutSessionExpired: ReturnType<typeof vi.fn>;
    handleChargeRefundedOrDisputed: ReturnType<typeof vi.fn>;
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
            profile: { findFirst: vi.fn() },
            $transaction: vi.fn((callback) => callback(prisma)),
          },
        },
        {
          provide: StripeService,
          useValue: {
            getSubscription: vi.fn(),
            cancelSubscription: vi.fn().mockResolvedValue(undefined),
            createCustomer: vi.fn(),
            createCheckoutSession: vi.fn(),
            createPortalSession: vi.fn(),
            constructEvent: vi.fn(),
          },
        },
        {
          provide: SlackService,
          useValue: { sendPaymentAlert: vi.fn().mockResolvedValue(true) },
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
            syncConnectPayoutLog: vi.fn().mockResolvedValue(undefined),
            handleAccountUpdated: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    slackService = module.get<SlackService>(SlackService);
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
    it('returns CSV filtered by userId with sanitized descriptions', async () => {
      prisma.transaction.findMany = vi.fn().mockResolvedValue([
        {
          id: 'tx_1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          type: 'DIRECT_TIP',
          amount: 500,
          currency: 'EUR',
          status: 'COMPLETED',
          sender: { email: 'sender@test.com' },
          receiver: { email: 'receiver@test.com' },
          description: 'A "special" tip',
        },
      ]);

      const csv = await service.getLedgerCsv('user_1');
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ senderId: 'user_1' }, { receiverId: 'user_1' }] },
        }),
      );
      expect(csv).toContain(
        'ID,Date,Type,Amount,Currency,Status,Sender,Receiver,Description',
      );
      expect(csv).toContain(
        '"tx_1","2026-01-01T00:00:00.000Z","DIRECT_TIP","500","EUR","COMPLETED","sender@test.com","receiver@test.com","A ""special"" tip"',
      );
    });

    it('returns CSV for admin with null sender/receiver mapped to SYSTEM', async () => {
      prisma.transaction.findMany = vi.fn().mockResolvedValue([
        {
          id: 'tx_2',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          type: 'PROMOTION_PAYMENT',
          amount: 1000,
          currency: 'EUR',
          status: 'COMPLETED',
          sender: null,
          receiver: null,
          description: null,
        },
      ]);

      const csv = await service.getLedgerCsv();
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
      expect(csv).toContain('"SYSTEM","SYSTEM",""');
    });
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
        service.createCheckout('u_none', 'plan_1', 'MONTHLY'),
      ).rejects.toThrow('User not found');
    });

    it('throws PLAN_NOT_FOUND when plan does not exist', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        platformSubscriptions: [],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue(null);

      await expect(
        service.createCheckout('u_1', 'plan_none', 'MONTHLY'),
      ).rejects.toThrow('Plan not found');
    });

    it('throws BadRequest ACTIVE_SUBSCRIPTION_EXISTS when already subscribed to the same plan', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        platformSubscriptions: [
          { planId: 'plan_1', status: SubscriptionStatus.ACTIVE },
        ],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        id: 'plan_1',
        stripePriceId: 'price_monthly',
      });

      await expect(
        service.createCheckout('u_1', 'plan_1', 'MONTHLY'),
      ).rejects.toThrow('You already have an active subscription to this plan');
    });

    it('throws Conflict ACTIVE_SUBSCRIPTION_EXISTS when subscribed to a different active plan', async () => {
      prisma.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u_1',
        platformSubscriptions: [
          { planId: 'plan_diff', status: SubscriptionStatus.ACTIVE },
        ],
      });
      prisma.platformPlan.findFirst = vi.fn().mockResolvedValue({
        id: 'plan_1',
        stripePriceId: 'price_monthly',
      });

      await expect(
        service.createCheckout('u_1', 'plan_1', 'MONTHLY'),
      ).rejects.toThrow('You already have an active platform plan');
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
        service.createCheckout('u_1', 'plan_1', 'YEARLY'),
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

      const promise1 = service.createCheckout('u_flight', 'plan_1', 'MONTHLY');
      const promise2 = service.createCheckout('u_flight', 'plan_1', 'MONTHLY');

      const [res1, res2] = await Promise.all([promise1, promise2]);
      expect(res1).toEqual({ id: 'cs_flight' });
      expect(res2).toEqual({ id: 'cs_flight' });
      expect(stripeService.createCheckoutSession).toHaveBeenCalledTimes(1);
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
          idempotencyKey: 'checkout_sub_u_year:plan_1:YEARLY',
        }),
      );
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

      const res = await service.getBillingStatus('u_1');
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

      const res = await service.getBillingStatus('u_1');
      expect(res.hasActiveSubscription).toBe(false);
      expect(res.subscription?.status).toBe(SubscriptionStatus.PAST_DUE);
    });

    it('returns null subscription when no subscription found', async () => {
      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue(null);

      const res = await service.getBillingStatus('u_1');
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
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
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

      expect(prisma.platformSubscription.upsert).toHaveBeenCalled();
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
      expect(slackService.sendPaymentAlert).toHaveBeenCalled();
      expect(prisma.webhookEvent.update).toHaveBeenCalled();
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
        current_period_start: 1000,
        current_period_end: 2000,
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
            current_period_end: Math.floor(Date.now() / 1000),
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
        data: expect.objectContaining({ status: SubscriptionStatus.PAST_DUE }),
      });

      expect(usersService.syncUserTier).toHaveBeenCalledWith('user1');
    });

    it('4. should handle customer.subscription.deleted', async () => {
      const event = {
        id: 'evt_sub_del_1',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_789',
            status: 'canceled',
            current_period_end: Math.floor(Date.now() / 1000),
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
            subscription: 'sub_fail',
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

    it('handles email receipt and Slack alert failures in platform subscription checkout', async () => {
      emailService.sendSubscriptionReceipt = vi
        .fn()
        .mockRejectedValue(new Error('Email service error'));
      slackService.sendPaymentAlert = vi
        .fn()
        .mockRejectedValue(new Error('Slack error'));
      prisma.user.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'u_sub', email: 'sub@test.com' });
      prisma.platformPlan.findUnique = vi
        .fn()
        .mockResolvedValue({ id: 'p_sub', name: 'VIP Plan' });
      stripeService.getSubscription = vi.fn().mockResolvedValue({
        status: 'active',
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_592_000,
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
