import { ErrorCode } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowsService } from '../../follows/follows.service.js';
import { MonetizationService } from '../../monetization/monetization.service.js';
import { PaymentsService } from '../../payments/payments.service.js';

describe('Transaction Boundaries and Concurrency Invariants', () => {
  describe('Monetization & Financial Ledger Invariants', () => {
    let monetizationService: MonetizationService;
    let mockPrisma: any;
    let mockStripeService: any;

    beforeEach(() => {
      mockPrisma = {
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
        user: {
          findUnique: vi.fn(),
        },
        post: {
          findUnique: vi.fn(),
        },
        postUnlock: {
          findUnique: vi.fn(),
        },
        story: {
          findUnique: vi.fn(),
        },
        storyUnlock: {
          findUnique: vi.fn(),
        },
        message: {
          findUnique: vi.fn(),
        },
        messageUnlock: {
          findUnique: vi.fn(),
        },
        platformFeeLedger: {
          create: vi.fn(),
        },
      };

      mockStripeService = {
        createCheckoutSession: vi.fn(),
        createAccountLink: vi.fn(),
        getAccountStatus: vi.fn(),
        createLoginLink: vi.fn(),
      };

      monetizationService = new MonetizationService(
        mockPrisma,
        mockStripeService,
      );
    });

    it('rejects self-tip attempt before touching payment provider', async () => {
      await expect(
        monetizationService.createTipSession(
          'user-1',
          'user-1',
          500,
          'https://return',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.CANNOT_TIP_SELF,
        }),
      );

      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('rejects tip below minimum €1.00 threshold', async () => {
      await expect(
        monetizationService.createTipSession(
          'user-1',
          'user-2',
          50,
          'https://return',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.MINIMUM_TIP_NOT_MET,
        }),
      );

      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('rejects tip when creator has no active Stripe Connect account', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'creator-1',
        stripeConnectAccountId: null,
      });

      await expect(
        monetizationService.createTipSession(
          'user-1',
          'creator-1',
          1000,
          'https://return',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        }),
      );

      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('enforces 20% platform fee calculation and transfers 80% to creator (ADR-0010)', async () => {
      const tipAmountCents = 1000;
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'creator-1',
          email: 'creator@sfera.com',
          stripeConnectAccountId: 'acct_creator_123',
        })
        .mockResolvedValueOnce({ id: 'sender-1', email: 'sender@sfera.com' });

      mockStripeService.createCheckoutSession.mockResolvedValue({
        id: 'cs_test_tip',
        url: 'https://checkout.stripe.com/tip',
      });

      const res = await monetizationService.createTipSession(
        'sender-1',
        'creator-1',
        tipAmountCents,
        'https://return.com',
      );

      expect(res.url).toBe('https://checkout.stripe.com/tip');
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_intent_data: expect.objectContaining({
            application_fee_amount: 200, // 20% of 1000 cents
            transfer_data: { destination: 'acct_creator_123' },
          }),
        }),
        expect.anything(),
      );
    });

    it('enforces pay-per-view unlock: rejects creator without active Connect account', async () => {
      mockPrisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'author-prof-id',
        profile: {
          user: { stripeConnectAccountId: null },
        },
      });

      await expect(
        monetizationService.createPostUnlockSession(
          'buyer-user-id',
          'buyer-prof-id',
          'post-1',
          'https://return',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.CREATOR_STRIPE_NOT_SETUP,
        }),
      );

      expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('prevents author from buying their own locked content', async () => {
      mockPrisma.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'same-prof-id',
        profile: {
          user: { id: 'same-user-id' },
        },
      });

      await expect(
        monetizationService.createPostUnlockSession(
          'same-user-id',
          'same-prof-id',
          'post-1',
          'https://return',
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.CANNOT_BUY_OWN_CONTENT,
        }),
      );
    });
  });

  describe('Stripe Webhook Concurrency & Idempotency Invariants', () => {
    let paymentsService: PaymentsService;
    let mockPrisma: any;
    let mockConfigService: any;
    let mockEmailService: any;
    let mockSlackService: any;
    let mockStripeService: any;
    let mockMonetizationWebhookService: any;

    beforeEach(() => {
      mockStripeService = {
        stripe: {},
      };
      mockPrisma = {
        webhookEvent: {
          findUnique: vi.fn(),
          create: vi.fn(),
          updateMany: vi.fn(),
        },
      };

      mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'STRIPE_SECRET_KEY') return 'sk_test_mock';
          return null;
        }),
      };

      mockEmailService = {
        sendSubscriptionReceipt: vi.fn(),
      };

      mockSlackService = {
        sendPaymentAlert: vi.fn(),
      };

      mockMonetizationWebhookService = {
        handleCheckoutSessionCompleted: vi.fn(),
        handleCheckoutSessionExpired: vi.fn(),
        handleChargeRefundedOrDisputed: vi.fn(),
        syncConnectPayoutLog: vi.fn(),
        handleAccountUpdated: vi.fn(),
      };

      paymentsService = new PaymentsService(
        mockPrisma,
        mockStripeService,
        mockSlackService,
        mockEmailService,
        {} as any,
        mockMonetizationWebhookService,
        mockConfigService as any,
      );
    });

    it('guarantees idempotency: duplicate PROCESSED event is discarded immediately without reprocessing', async () => {
      const duplicateEvent = {
        id: 'evt_duplicate_processed_123',
        type: 'invoice.payment_succeeded',
      } as any;

      mockPrisma.webhookEvent.findUnique.mockResolvedValue({
        id: 'evt_duplicate_processed_123',
        status: 'PROCESSED',
      });

      await paymentsService.processWebhookEvent(duplicateEvent);

      expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendSubscriptionReceipt).not.toHaveBeenCalled();
    });

    it('handles concurrent P2002 race condition on webhookEvent creation safely', async () => {
      const racingEvent = {
        id: 'evt_racing_123',
        type: 'customer.subscription.created',
      } as any;

      // First query: not found yet
      mockPrisma.webhookEvent.findUnique.mockResolvedValueOnce(null);

      // Concurrent insert throws Prisma unique constraint P2002
      mockPrisma.webhookEvent.create.mockRejectedValueOnce({ code: 'P2002' });

      // Second query after P2002: other worker already set it to PROCESSED
      mockPrisma.webhookEvent.findUnique.mockResolvedValueOnce({
        id: 'evt_racing_123',
        status: 'PROCESSED',
      });

      await paymentsService.processWebhookEvent(racingEvent);

      expect(mockPrisma.webhookEvent.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('Relationship Network Concurrency & Uniqueness Invariants', () => {
    let followsService: FollowsService;
    let mockPrisma: any;
    let mockEventEmitter: any;
    let mockSystemSettings: any;
    let mockTurnstile: any;

    beforeEach(() => {
      mockPrisma = {
        profile: {
          findFirst: vi.fn(),
        },
        block: {
          findUnique: vi.fn(),
          create: vi.fn(),
        },
        follow: {
          findUnique: vi.fn(),
          create: vi.fn(),
          delete: vi.fn(),
        },
      };

      mockEventEmitter = {
        emit: vi.fn(),
      };

      mockSystemSettings = {
        getSetting: vi.fn().mockResolvedValue(false),
      };

      mockTurnstile = {
        validateToken: vi.fn().mockResolvedValue({ success: true }),
      };

      followsService = new FollowsService(
        mockPrisma,
        mockEventEmitter,
        mockSystemSettings,
        mockTurnstile,
      );
    });

    it('rejects self-follow before touching database', async () => {
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-same',
        username: 'same',
      });

      await expect(
        followsService.toggle('same', 'prof-same', 'user-id'),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.CANNOT_FOLLOW_SELF,
        }),
      );

      expect(mockPrisma.follow.create).not.toHaveBeenCalled();
    });

    it('blocks follow toggle if blocker relation exists in unique index', async () => {
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-target',
        username: 'target',
      });
      mockPrisma.block.findUnique.mockResolvedValue({
        id: 'block-1',
        blockerId: 'prof-target',
        blockedId: 'prof-actor',
      });

      // Target acts as if not found to prevent leaking account existence to blocked actor
      await expect(
        followsService.toggle('target', 'prof-actor', 'user-id'),
      ).rejects.toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.USER_NOT_FOUND,
        }),
      );

      expect(mockPrisma.follow.findUnique).not.toHaveBeenCalled();
    });
  });
});
