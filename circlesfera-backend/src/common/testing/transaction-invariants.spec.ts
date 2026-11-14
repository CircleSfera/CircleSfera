import { ErrorCode } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowsService } from '../../follows/follows.service.js';
import { PaymentsService } from '../../payments/payments.service.js';

// Whoever pays here is an adult, unless a test says otherwise; the rule is
// tested on its own (adult-payer.policy.spec.ts).
const adultPayer = vi.hoisted(() => ({
  assertAdultPayer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../policies/adult-payer.policy.js', () => adultPayer);

describe('Transaction Boundaries and Concurrency Invariants', () => {
  describe('Stripe Webhook Concurrency & Idempotency Invariants', () => {
    let paymentsService: PaymentsService;
    let mockPrisma: any;
    let mockConfigService: any;
    let mockEmailService: any;
    let mockSlackService: any;
    let mockStripeService: any;
    let mockPaymentEvents: any;

    beforeEach(() => {
      mockStripeService = {
        stripe: {},
      };
      mockPrisma = {
        user: { findMany: vi.fn().mockResolvedValue([]) },
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

      mockPaymentEvents = {
        handleCheckoutSessionCompleted: vi.fn(),
        handleCheckoutSessionExpired: vi.fn(),
        handleChargeRefunded: vi.fn(),
        applyDisputeToPayment: vi.fn(),
      };

      paymentsService = new PaymentsService(
        mockPrisma,
        mockStripeService,
        mockSlackService,
        mockEmailService,
        {} as any,
        mockPaymentEvents,
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
        user: { findMany: vi.fn().mockResolvedValue([]) },
        profile: {
          findFirst: vi.fn(),
        },
        block: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
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
        {
          consume: vi.fn().mockResolvedValue(undefined),
          trackWrite: vi.fn().mockResolvedValue(undefined),
          recordText: vi.fn().mockResolvedValue(undefined),
        } as never,
        { hideOnBlock: vi.fn(async () => undefined) } as never,
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
      mockPrisma.block.findFirst.mockResolvedValue({
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
