import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CREATOR_SHARE_DECIMAL } from '../common/constants/monetization.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { MonetizationWebhookService } from './monetization-webhook.service.js';

describe('MonetizationWebhookService', () => {
  let service: MonetizationWebhookService;
  let prisma: any;
  let slackService: any;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonetizationWebhookService,
        {
          provide: PrismaService,
          useValue: {
            postUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            storyUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            messageUnlock: { upsert: vi.fn(), deleteMany: vi.fn() },
            transaction: {
              create: vi.fn(),
              findUnique: vi.fn(),
              update: vi.fn(),
            },
            monetization: { upsert: vi.fn() },
            stripePayoutLog: { upsert: vi.fn() },
            promotion: { update: vi.fn(), updateMany: vi.fn() },
            user: { findFirst: vi.fn() },
            profile: { findFirst: vi.fn() },
            $transaction: vi.fn((callback) => callback(prisma)),
          },
        },
        {
          provide: SlackService,
          useValue: { sendPaymentAlert: vi.fn().mockResolvedValue(true) },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<MonetizationWebhookService>(
      MonetizationWebhookService,
    );
    prisma = module.get<PrismaService>(PrismaService);
    slackService = module.get<SlackService>(SlackService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleCheckoutSessionCompleted', () => {
    it('processes a PROMOTION checkout', async () => {
      const session = {
        id: 'cs_promo_1',
        amount_total: 5000,
        currency: 'eur',
        metadata: {
          type: 'PROMOTION',
          promotionId: 'promo_test_id',
          userId: 'user_promo',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

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

    it('throws BadRequest when PROMOTION metadata lacks promotionId', async () => {
      const session = {
        id: 'cs_promo_err',
        metadata: { type: 'PROMOTION' },
      } as any;

      await expect(
        service.handleCheckoutSessionCompleted(session),
      ).rejects.toThrow('PROMOTION checkout missing promotionId');
    });

    it('processes a DIRECT_POST_UNLOCK checkout', async () => {
      const grossCents = 1000;
      const creatorShareCents = Math.floor(grossCents * CREATOR_SHARE_DECIMAL);
      const session = {
        id: 'cs_unlock_1',
        client_reference_id: 'buyer1',
        amount_total: grossCents,
        currency: 'eur',
        payment_intent: 'pi_12345',
        metadata: {
          type: 'DIRECT_POST_UNLOCK',
          postId: 'post1',
          creatorId: 'creator1',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

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
          update: {
            lifetimeEarningsCents: { increment: creatorShareCents },
          },
          create: {
            userId: 'creator1',
            lifetimeEarningsCents: creatorShareCents,
          },
        }),
      );
      expect(slackService.sendPaymentAlert).toHaveBeenCalled();
    });

    it('processes a DIRECT_TIP checkout and notifies the creator', async () => {
      const session = {
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
      } as any;

      prisma.profile.findFirst = vi
        .fn()
        .mockResolvedValueOnce({ id: 'creator-profile-2' })
        .mockResolvedValueOnce({ id: 'tipper-profile-1' });

      await service.handleCheckoutSessionCompleted(session);

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
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'creator-profile-2',
          senderId: 'tipper-profile-1',
          type: 'PAYMENT',
        }),
      );
    });

    it('processes a DIRECT_STORY_UNLOCK checkout', async () => {
      const session = {
        id: 'cs_story_1',
        client_reference_id: 'buyer1',
        amount_total: 250,
        currency: 'eur',
        payment_intent: 'pi_story_1',
        metadata: {
          type: 'DIRECT_STORY_UNLOCK',
          storyId: 'story1',
          creatorId: 'creator1',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.storyUnlock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_storyId: { userId: 'buyer1', storyId: 'story1' } },
        }),
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'DIRECT_STORY_UNLOCK',
            storyId: 'story1',
            stripePaymentIntentId: 'pi_story_1',
          }),
        }),
      );
    });

    it('processes a DIRECT_MESSAGE_UNLOCK checkout and notifies the creator', async () => {
      const session = {
        id: 'cs_msg_1',
        client_reference_id: 'buyer1',
        amount_total: 400,
        currency: 'eur',
        payment_intent: 'pi_msg_1',
        metadata: {
          type: 'DIRECT_MESSAGE_UNLOCK',
          messageId: 'msg1',
          creatorId: 'creator1',
        },
      } as any;

      prisma.profile.findFirst = vi
        .fn()
        .mockResolvedValueOnce({ id: 'creator-prof-1' })
        .mockResolvedValueOnce({ id: 'buyer-prof-1' });

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.messageUnlock.upsert).toHaveBeenCalledWith({
        where: { userId_messageId: { userId: 'buyer1', messageId: 'msg1' } },
        update: {},
        create: { userId: 'buyer1', messageId: 'msg1', pricePaid: 400 },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'creator-prof-1',
          senderId: 'buyer-prof-1',
          content: expect.stringContaining('unlocked your private message'),
        }),
      );
    });

    it('processes a DIRECT_LIVE_GIFT checkout by emitting payment.live_gift_completed', async () => {
      const session = {
        id: 'cs_gift_1',
        client_reference_id: 'gifter1',
        amount_total: 200,
        currency: 'eur',
        payment_intent: 'pi_gift_1',
        metadata: {
          type: 'DIRECT_LIVE_GIFT',
          liveGiftId: 'lg_1',
          streamId: 'str_1',
          giftId: 'rose',
          creatorId: 'creator1',
        },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.live_gift_completed',
        expect.objectContaining({
          liveGiftId: 'lg_1',
          streamId: 'str_1',
          giftId: 'rose',
          creatorId: 'creator1',
          amountCents: 200,
        }),
      );
    });

    it('ignores legacy VIP Subscription (STRIPE_SUBSCRIPTION) metadata as a no-op', async () => {
      const session = {
        id: 'cs_vip',
        metadata: { type: 'STRIPE_SUBSCRIPTION' },
      } as any;

      await expect(
        service.handleCheckoutSessionCompleted(session),
      ).resolves.toBeUndefined();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('handles Slack alert error gracefully in PROMOTION checkout', async () => {
      slackService.sendPaymentAlert = vi
        .fn()
        .mockRejectedValue(new Error('Slack rate limit'));
      prisma.promotion.update = vi.fn().mockResolvedValue({});

      await expect(
        service.handleCheckoutSessionCompleted({
          id: 'cs_promo_slack',
          amount_total: 5000,
          metadata: { type: 'PROMOTION', promotionId: 'promo_slack' },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('handles Slack alert error gracefully in DIRECT_POST_UNLOCK checkout', async () => {
      slackService.sendPaymentAlert = vi
        .fn()
        .mockRejectedValue(new Error('Slack down'));
      prisma.profile.findFirst = vi.fn().mockResolvedValue({ id: 'prof_1' });

      await expect(
        service.handleCheckoutSessionCompleted({
          id: 'cs_post_slack',
          client_reference_id: 'user_buyer',
          amount_total: 1000,
          metadata: {
            type: 'DIRECT_POST_UNLOCK',
            postId: 'p_1',
            creatorId: 'user_creator',
          },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('handles Slack alert error gracefully in DIRECT_TIP checkout', async () => {
      slackService.sendPaymentAlert = vi
        .fn()
        .mockRejectedValue(new Error('Slack down'));
      prisma.profile.findFirst = vi.fn().mockResolvedValue({ id: 'prof_1' });

      await expect(
        service.handleCheckoutSessionCompleted({
          id: 'cs_tip_slack',
          client_reference_id: 'user_tipper',
          amount_total: 500,
          metadata: { type: 'DIRECT_TIP', creatorId: 'user_creator' },
        } as any),
      ).resolves.toBeUndefined();
    });

    it('handles DIRECT_LIVE_GIFT without an eventEmitter or missing metadata, and Slack alert error', async () => {
      slackService.sendPaymentAlert = vi
        .fn()
        .mockRejectedValue(new Error('Slack down'));

      const serviceNoEmitter = new MonetizationWebhookService(
        prisma,
        slackService,
        undefined,
      );
      await expect(
        serviceNoEmitter.handleCheckoutSessionCompleted({
          id: 'cs_live_err',
          client_reference_id: '',
          metadata: { type: 'DIRECT_LIVE_GIFT' },
        } as any),
      ).resolves.toBeUndefined();

      await expect(
        service.handleCheckoutSessionCompleted({
          id: 'cs_live_slack',
          client_reference_id: 'u_giftee',
          amount_total: 250,
          metadata: {
            type: 'DIRECT_LIVE_GIFT',
            liveGiftId: 'gift_1',
            streamId: 'stream_1',
            giftId: 'g_1',
            creatorId: 'creator_1',
          },
        } as any),
      ).resolves.toBeUndefined();
    });
  });

  describe('emitPaymentNotification (private, via DIRECT_TIP/MESSAGE_UNLOCK)', () => {
    it('exits early when eventEmitter is missing or recipient has no profile', async () => {
      const serviceNoEmitter = new MonetizationWebhookService(
        prisma,
        slackService,
        undefined,
      );
      await (serviceNoEmitter as any).emitPaymentNotification({
        recipientUserId: 'u_recip',
        senderUserId: 'u_send',
        content: 'Tip received',
      });

      prisma.profile.findFirst = vi.fn().mockResolvedValue(null);
      await (service as any).emitPaymentNotification({
        recipientUserId: 'u_recip',
        senderUserId: 'u_send',
        content: 'Tip received',
      });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckoutSessionExpired', () => {
    it('marks a PENDING promotion FAILED', async () => {
      await service.handleCheckoutSessionExpired({
        id: 'cs_exp',
        metadata: { type: 'PROMOTION', promotionId: 'promo_exp' },
      } as any);

      expect(prisma.promotion.updateMany).toHaveBeenCalledWith({
        where: { id: 'promo_exp', status: 'PENDING' },
        data: { status: 'FAILED' },
      });
    });
  });

  describe('handleChargeRefundedOrDisputed', () => {
    it('revokes post and story unlocks and marks the Transaction REFUNDED', async () => {
      // Direct Post Unlock refund
      prisma.transaction.findUnique = vi.fn().mockResolvedValueOnce({
        id: 'tx_post',
        type: 'DIRECT_POST_UNLOCK',
        senderId: 'buyer1',
        postId: 'post1',
      });

      await service.handleChargeRefundedOrDisputed({
        payment_intent: 'pi_post_1',
      });

      expect(prisma.postUnlock.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'buyer1', postId: 'post1' },
      });

      // Direct Story Unlock refund
      prisma.transaction.findUnique = vi.fn().mockResolvedValueOnce({
        id: 'tx1',
        type: 'DIRECT_STORY_UNLOCK',
        senderId: 'buyer1',
        storyId: 'story1',
        stripePaymentIntentId: 'pi_story_1',
      });

      await service.handleChargeRefundedOrDisputed({
        payment_intent: 'pi_story_1',
      });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx1' },
          data: { status: 'REFUNDED' },
        }),
      );
      expect(prisma.storyUnlock.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'buyer1', storyId: 'story1' },
      });

      // Refund for non-existent transaction should return safely
      prisma.transaction.findUnique = vi.fn().mockResolvedValueOnce(null);
      await expect(
        service.handleChargeRefundedOrDisputed({ payment_intent: 'pi_none' }),
      ).resolves.toBeUndefined();
    });

    it('is idempotent on a duplicate refund/dispute webhook for an already-REFUNDED transaction', async () => {
      prisma.transaction.findUnique = vi.fn().mockResolvedValueOnce({
        id: 'tx_already_refunded',
        type: 'DIRECT_POST_UNLOCK',
        senderId: 'buyer1',
        postId: 'post1',
        status: 'REFUNDED',
      });

      await service.handleChargeRefundedOrDisputed({
        payment_intent: 'pi_already_refunded',
      });

      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
    });

    it('does not transition a FAILED transaction to REFUNDED', async () => {
      prisma.transaction.findUnique = vi.fn().mockResolvedValueOnce({
        id: 'tx_failed',
        type: 'DIRECT_POST_UNLOCK',
        senderId: 'buyer1',
        postId: 'post1',
        status: 'FAILED',
      });

      await service.handleChargeRefundedOrDisputed({
        payment_intent: 'pi_failed',
      });

      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(prisma.postUnlock.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('handleAccountUpdated', () => {
    it('syncs Connect capability flags for the linked user', async () => {
      prisma.user.findFirst = vi.fn().mockResolvedValue({ id: 'creator1' });

      await service.handleAccountUpdated({
        id: 'acct_1',
        charges_enabled: true,
        capabilities: { transfers: 'active' },
      });

      expect(prisma.monetization.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'creator1' },
          update: expect.objectContaining({
            transfersEnabled: true,
            chargesEnabled: true,
          }),
        }),
      );
    });
  });

  describe('syncConnectPayoutLog', () => {
    it('upserts StripePayoutLog on a paid payout', async () => {
      prisma.user.findFirst = vi.fn().mockResolvedValue({ id: 'creator1' });
      prisma.stripePayoutLog.upsert = vi.fn().mockResolvedValue({});

      await service.syncConnectPayoutLog({
        account: 'acct_1',
        data: {
          object: {
            id: 'po_1',
            amount: 2500,
            currency: 'eur',
            status: 'paid',
            arrival_date: 1_714_521_600,
          },
        },
      });

      expect(prisma.stripePayoutLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripePayoutId: 'po_1' },
          create: expect.objectContaining({
            userId: 'creator1',
            amountCents: 2500,
            currency: 'eur',
            status: 'paid',
          }),
          update: expect.objectContaining({
            status: 'paid',
            amountCents: 2500,
          }),
        }),
      );
    });

    it('maps in_transit payouts to pending and skips unknown Connect accounts', async () => {
      prisma.user.findFirst = vi.fn().mockResolvedValueOnce({ id: 'creator1' });

      await service.syncConnectPayoutLog({
        account: 'acct_1',
        data: {
          object: {
            id: 'po_2',
            amount: 100,
            currency: 'eur',
            status: 'in_transit',
            arrival_date: 1_714_521_600,
          },
        },
      });
      expect(prisma.stripePayoutLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'pending' }),
          update: expect.objectContaining({ status: 'pending' }),
        }),
      );

      prisma.user.findFirst = vi.fn().mockResolvedValueOnce(null);
      prisma.stripePayoutLog.upsert = vi.fn();
      await service.syncConnectPayoutLog({
        account: 'acct_unknown',
        data: { object: { id: 'po_3', amount: 1, status: 'failed' } },
      });
      expect(prisma.stripePayoutLog.upsert).not.toHaveBeenCalled();
    });

    it('handles a Connect payout event missing accountId or payoutId', async () => {
      await expect(
        service.syncConnectPayoutLog({
          account: undefined,
          data: { object: { id: undefined } },
        }),
      ).resolves.toBeUndefined();
      expect(prisma.stripePayoutLog.upsert).not.toHaveBeenCalled();
    });
  });
});
