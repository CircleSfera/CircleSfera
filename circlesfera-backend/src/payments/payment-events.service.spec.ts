import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  isOneTimeCheckoutType,
  PaymentEventsService,
} from './payment-events.service.js';

describe('PaymentEventsService', () => {
  let service: PaymentEventsService;
  let prisma: any;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              create: vi.fn(),
              findUnique: vi.fn(),
              update: vi.fn(),
              updateMany: vi.fn(),
            },
            // No dispute reported before its payment, unless a test says so.
            paymentDispute: {
              findMany: vi.fn().mockResolvedValue([]),
              findUnique: vi.fn().mockResolvedValue(null),
              updateMany: vi.fn(),
            },
            promotion: { update: vi.fn(), updateMany: vi.fn() },
            $transaction: vi.fn((callback) => callback(prisma)),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<PaymentEventsService>(PaymentEventsService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('routes only promotions and the legacy subscription metadata here', () => {
    expect(isOneTimeCheckoutType('PROMOTION')).toBe(true);
    expect(isOneTimeCheckoutType('STRIPE_SUBSCRIPTION')).toBe(true);
    expect(isOneTimeCheckoutType('TIP')).toBe(false);
    expect(isOneTimeCheckoutType(undefined)).toBe(false);
  });

  describe('handleCheckoutSessionCompleted', () => {
    it('processes a PROMOTION checkout', async () => {
      const session = {
        id: 'cs_promo_1',
        amount_total: 5000,
        currency: 'eur',
        payment_intent: 'pi_promo_1',
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
        data: {
          type: 'PROMOTION_PAYMENT',
          amount: 5000,
          currency: 'EUR',
          status: 'COMPLETED',
          senderId: 'user_promo',
          promotionId: 'promo_test_id',
          stripePaymentIntentId: 'pi_promo_1',
          description: 'Promotion checkout cs_promo_1',
        },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('payment.alert', {
        eventType: 'Promotion Payment',
        amount: 5000,
        currency: 'eur',
        description: 'Promotion ID: promo_test_id',
      });
    });

    it('records a promotion paid without amount, currency, buyer or payment named, by its checkout', async () => {
      const session = {
        id: 'cs_promo_2',
        payment_intent: { id: 'pi_obj' },
        metadata: { type: 'PROMOTION', promotionId: 'promo_2' },
      } as any;

      await service.handleCheckoutSessionCompleted(session);

      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 0,
          currency: 'EUR',
          senderId: null,
          stripePaymentIntentId: 'pi_obj',
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payment.alert',
        expect.objectContaining({ amount: 0, currency: 'eur' }),
      );

      prisma.transaction.create.mockClear();
      await service.handleCheckoutSessionCompleted({
        id: 'cs_promo_3',
        payment_intent: null,
        metadata: { type: 'PROMOTION', promotionId: 'promo_3' },
      } as any);
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stripePaymentIntentId: 'cs_promo_3' }),
      });
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

    it('records the promotion without telling staff when nobody listens for alerts', async () => {
      const quiet = new PaymentEventsService(prisma);

      await quiet.handleCheckoutSessionCompleted({
        id: 'cs_promo_q',
        payment_intent: 'pi_q',
        metadata: { type: 'PROMOTION', promotionId: 'promo_q' },
      } as any);

      expect(prisma.transaction.create).toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    describe('a dispute reported before its payment was recorded', () => {
      const session = {
        id: 'cs_promo_d',
        amount_total: 1000,
        currency: 'eur',
        payment_intent: 'pi_disputed',
        metadata: {
          type: 'PROMOTION',
          promotionId: 'promo_d',
          userId: 'buyer1',
        },
      } as any;
      const recorded = {
        id: 'tx-new',
        status: 'COMPLETED',
        amount: 1000,
        refundedCents: 0,
      };

      it('is tied to the payment and applied once the payment is recorded', async () => {
        prisma.paymentDispute.findMany.mockResolvedValueOnce([
          {
            id: 'pd-1',
            stripeDisputeId: 'du_early',
            status: 'lost',
            transactionId: null,
          },
        ]);
        prisma.transaction.findUnique.mockResolvedValue(recorded);

        await service.handleCheckoutSessionCompleted(session);

        expect(prisma.paymentDispute.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { stripePaymentIntentId: 'pi_disputed' },
          }),
        );
        expect(prisma.paymentDispute.updateMany).toHaveBeenCalledWith({
          where: { stripeDisputeId: 'du_early', transactionId: null },
          data: { transactionId: 'tx-new' },
        });
        // Lost: the payment is refunded.
        expect(prisma.transaction.update).toHaveBeenCalledWith({
          where: { id: 'tx-new' },
          data: { status: 'REFUNDED' },
        });
      });

      it.each([
        ['open', 'needs_response', 'DISPUTED'],
        ['won', 'won', 'COMPLETED'],
      ])(
        'holds the payment when the earlier dispute is %s, as its notice would have',
        async (_, status, expected) => {
          prisma.paymentDispute.findMany.mockResolvedValueOnce([
            { stripeDisputeId: 'du_early', status },
          ]);
          prisma.transaction.findUnique.mockResolvedValue({
            ...recorded,
            status: status === 'won' ? 'DISPUTED' : 'COMPLETED',
          });

          await service.handleCheckoutSessionCompleted(session);

          expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: { status: expected } }),
          );
        },
      );

      it('keeps the payment recorded when the earlier dispute cannot be applied', async () => {
        prisma.paymentDispute.findMany.mockResolvedValueOnce([
          { stripeDisputeId: 'du_early', status: 'lost' },
        ]);
        prisma.transaction.findUnique.mockRejectedValueOnce(
          new Error('db down'),
        );

        await expect(
          service.handleCheckoutSessionCompleted(session),
        ).resolves.toBeUndefined();
        expect(prisma.transaction.create).toHaveBeenCalled();
      });

      it('changes nothing for a payment no dispute was reported about', async () => {
        await service.handleCheckoutSessionCompleted(session);

        expect(prisma.paymentDispute.updateMany).not.toHaveBeenCalled();
        expect(prisma.transaction.update).not.toHaveBeenCalled();
      });
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
      // A checkout that names no payment looks for no earlier dispute.
      expect(prisma.paymentDispute.findMany).not.toHaveBeenCalled();
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

    it('changes nothing for any other checkout, or a promotion that names none', async () => {
      await service.handleCheckoutSessionExpired({
        id: 'cs_exp_2',
        metadata: { type: 'PROMOTION' },
      } as any);
      await service.handleCheckoutSessionExpired({
        id: 'cs_exp_3',
        metadata: null,
      } as any);

      expect(prisma.promotion.updateMany).not.toHaveBeenCalled();
    });
  });
});
