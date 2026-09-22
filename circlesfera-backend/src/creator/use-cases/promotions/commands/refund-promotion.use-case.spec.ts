import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PromotionRefundPolicy } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../../../../common/stripe/stripe.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { RefundPromotionUseCase } from './refund-promotion.use-case.js';

function basePromo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo-1',
    userId: 'user-1',
    refundPolicy: PromotionRefundPolicy.PROPORTIONAL,
    refundedAt: null,
    chargedAt: new Date(),
    stripePaymentIntentId: 'cs_test_123',
    budgetCents: 1000,
    currency: 'eur',
    ...overrides,
  };
}

describe('RefundPromotionUseCase', () => {
  let useCase: RefundPromotionUseCase;

  const mockPrismaService = {
    promotion: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
  };
  const mockStripeService = {
    createRefundFromCheckoutSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundPromotionUseCase,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    useCase = module.get<RefundPromotionUseCase>(RefundPromotionUseCase);
    vi.clearAllMocks();
  });

  it('throws NotFoundException for a missing promotion', async () => {
    mockPrismaService.promotion.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('promo-1', 'admin-reject')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('reports already_refunded without calling Stripe', async () => {
    mockPrismaService.promotion.findUnique.mockResolvedValue(
      basePromo({ refundedAt: new Date() }),
    );

    const result = await useCase.execute('promo-1', 'admin-reject');

    expect(result).toEqual({ refunded: false, reason: 'already_refunded' });
    expect(
      mockStripeService.createRefundFromCheckoutSession,
    ).not.toHaveBeenCalled();
  });

  it('reports policy_none for a NONE refund policy', async () => {
    mockPrismaService.promotion.findUnique.mockResolvedValue(
      basePromo({ refundPolicy: PromotionRefundPolicy.NONE }),
    );

    const result = await useCase.execute('promo-1', 'admin-reject');

    expect(result).toEqual({ refunded: false, reason: 'policy_none' });
  });

  it('reports not_charged when there is no chargedAt or checkout session id', async () => {
    mockPrismaService.promotion.findUnique.mockResolvedValue(
      basePromo({ chargedAt: null }),
    );

    const result = await useCase.execute('promo-1', 'admin-reject');

    expect(result).toEqual({ refunded: false, reason: 'not_charged' });
  });

  it('reports no_remaining_budget when budgetCents is 0', async () => {
    mockPrismaService.promotion.findUnique.mockResolvedValue(
      basePromo({ budgetCents: 0 }),
    );

    const result = await useCase.execute('promo-1', 'admin-reject');

    expect(result).toEqual({ refunded: false, reason: 'no_remaining_budget' });
  });

  it('reports skipped_unpaid when Stripe returns no refund for the checkout session', async () => {
    mockPrismaService.promotion.findUnique.mockResolvedValue(basePromo());
    mockStripeService.createRefundFromCheckoutSession.mockResolvedValue(null);

    const result = await useCase.execute('promo-1', 'admin-reject');

    expect(result).toEqual({ refunded: false, reason: 'skipped_unpaid' });
    expect(mockPrismaService.transaction.create).not.toHaveBeenCalled();
  });

  it('marks the promotion refunded and writes a REFUNDED Transaction row on success', async () => {
    mockPrismaService.promotion.findUnique.mockResolvedValue(basePromo());
    mockStripeService.createRefundFromCheckoutSession.mockResolvedValue({
      id: 're_test_123',
      amount: 1000,
      currency: 'eur',
    });
    mockPrismaService.promotion.update.mockResolvedValue({});
    mockPrismaService.transaction.create.mockResolvedValue({});

    const result = await useCase.execute('promo-1', 'user-cancel');

    expect(result).toEqual({ refunded: true, amount: 10, currency: 'EUR' });
    expect(mockPrismaService.promotion.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { refundedAt: expect.any(Date) },
    });
    expect(mockPrismaService.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'PROMOTION_PAYMENT',
        amount: -1000,
        currency: 'EUR',
        status: 'REFUNDED',
        receiverId: 'user-1',
        promotionId: 'promo-1',
        // Regression test (FIN-006): the refund's own Stripe id must be
        // stored so Transaction.stripePaymentIntentId's unique constraint
        // protects against a concurrent duplicate refund double-counting
        // in the ledger, same as every other monetization Transaction.
        stripePaymentIntentId: 're_test_123',
      }),
    });
  });
});
