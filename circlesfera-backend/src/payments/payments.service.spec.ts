import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../common/stripe/stripe.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { UsersService } from '../users/users.service.js';
import { PaymentsService } from './payments.service.js';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: PrismaService;
  let slackService: SlackService;
  let stripeService: any;
  let usersService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            webhookEvent: {
              create: vi.fn().mockResolvedValue({ id: 'wh_1' }),
              update: vi.fn(),
              findUnique: vi.fn().mockResolvedValue(null),
            },
            postUnlock: { upsert: vi.fn() },
            transaction: { create: vi.fn() },
            monetization: { upsert: vi.fn() },
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
            platformPlan: { findUnique: vi.fn() },
            user: { update: vi.fn(), findUnique: vi.fn() },
            $transaction: vi.fn((callback) => callback(prisma)),
          },
        },
        {
          provide: StripeService,
          useValue: {
            getSubscription: vi.fn(),
            cancelSubscription: vi.fn().mockResolvedValue(undefined),
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
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prisma = module.get<PrismaService>(PrismaService);
    slackService = module.get<SlackService>(SlackService);
    stripeService = module.get<StripeService>(StripeService);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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

      await expect(service.processWebhookEvent(event)).resolves.toBeUndefined();
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('1b. should mark FAILED and rethrow when handler fails', async () => {
      prisma.webhookEvent.findUnique = vi.fn().mockResolvedValue(null);
      prisma.webhookEvent.create = vi.fn().mockResolvedValue({ id: 'wh_fail' });
      prisma.webhookEvent.update = vi.fn().mockResolvedValue({});
      prisma.promotion.update = vi.fn().mockRejectedValue(new Error('db down'));

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

      await expect(service.processWebhookEvent(event)).rejects.toThrow(
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
      prisma.promotion.update = vi.fn().mockResolvedValue({});
      prisma.transaction.create = vi.fn().mockResolvedValue({});
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

      await service.processWebhookEvent(event);
      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(prisma.promotion.update).toHaveBeenCalled();
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
        current_period_end: Math.floor(Date.now() / 1000) + 2592000, // +30 days
      });

      prisma.platformPlan.findUnique = vi.fn().mockResolvedValue({
        id: 'plan_elite',
        name: 'Elite',
      });

      await service.processWebhookEvent(event);

      expect(prisma.platformSubscription.upsert).toHaveBeenCalled();

      // Verify User elevation is delegated
      expect(usersService.syncUserTier).toHaveBeenCalledWith('user1');

      expect(slackService.sendPaymentAlert).toHaveBeenCalled();
      expect(prisma.webhookEvent.update).toHaveBeenCalled();
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
          },
        },
      };

      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
        userId: 'user1',
        stripeSubscriptionId: 'sub_456',
      });

      await service.processWebhookEvent(event);

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
          },
        },
      };

      prisma.platformSubscription.findFirst = vi.fn().mockResolvedValue({
        userId: 'user2',
        stripeSubscriptionId: 'sub_789',
      });

      await service.processWebhookEvent(event);

      expect(prisma.platformSubscription.updateMany).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_789' },
        data: expect.objectContaining({ status: SubscriptionStatus.CANCELLED }),
      });

      expect(usersService.syncUserTier).toHaveBeenCalledWith('user2');
    });

    it('5. should handle checkout.session.completed for PROMOTION', async () => {
      const event = {
        id: 'evt_promo_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_promo_1',
            mode: 'payment',
            payment_status: 'paid',
            amount_total: 5000,
            currency: 'eur',
            metadata: {
              type: 'PROMOTION',
              promotionId: 'promo_test_id',
              userId: 'user_promo',
            },
          },
        },
      };

      await service.processWebhookEvent(event);

      expect(prisma.promotion.update).toHaveBeenCalledWith({
        where: { id: 'promo_test_id' },
        data: { status: 'ACTIVE', chargedAt: expect.any(Date) },
      });

      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'PROMOTION_PAYMENT',
          promotionId: 'promo_test_id',
        }),
      });

      expect(slackService.sendPaymentAlert).toHaveBeenCalled();
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

      await service.processWebhookEvent(event);

      expect(usersService.handleIdentityWebhook).toHaveBeenCalledWith(
        event.data.object,
      );
    });

    it('7. should handle checkout.session.completed for DIRECT_POST_UNLOCK', async () => {
      const event = {
        id: 'evt_unlock_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_unlock_1',
            client_reference_id: 'buyer1',
            amount_total: 1000,
            currency: 'eur',
            payment_intent: 'pi_12345',
            metadata: {
              type: 'DIRECT_POST_UNLOCK',
              postId: 'post1',
              creatorId: 'creator1',
            },
          },
        },
      };

      await service.processWebhookEvent(event);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.postUnlock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_postId: { userId: 'buyer1', postId: 'post1' } },
        }),
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DIRECT_POST_UNLOCK',
            senderId: 'buyer1',
            receiverId: 'creator1',
            postId: 'post1',
          }),
        }),
      );
      expect(prisma.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'creator1' },
        }),
      );
      expect(slackService.sendPaymentAlert).toHaveBeenCalled();
    });

    it('8. should handle checkout.session.completed for DIRECT_TIP', async () => {
      const event = {
        id: 'evt_tip_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_tip_1',
            client_reference_id: 'tipper1',
            amount_total: 500,
            currency: 'eur',
            payment_intent: 'pi_tip_123',
            metadata: {
              type: 'DIRECT_TIP',
              creatorId: 'creator2',
              postId: 'post2',
            },
          },
        },
      };

      await service.processWebhookEvent(event);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DIRECT_TIP',
            senderId: 'tipper1',
            receiverId: 'creator2',
          }),
        }),
      );
    });

    it('9. should handle unknown event gracefully', async () => {
      const event = {
        id: 'evt_unknown',
        type: 'unknown.event.type',
        data: {},
      };

      await expect(service.processWebhookEvent(event)).resolves.toBeUndefined();
      expect(prisma.webhookEvent.create).toHaveBeenCalled(); // Should log event
      // Should not throw, should just log and return
    });
  });
});
