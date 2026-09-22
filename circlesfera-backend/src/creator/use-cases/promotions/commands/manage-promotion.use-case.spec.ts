import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PromotionRefundPolicy, PromotionStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../../../../common/stripe/stripe.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { ManagePromotionUseCase } from './manage-promotion.use-case.js';
import { RefundPromotionUseCase } from './refund-promotion.use-case.js';

function basePromo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo-1',
    userId: 'user-1',
    status: PromotionStatus.ACTIVE,
    endDate: new Date(Date.now() + 86_400_000),
    refundPolicy: PromotionRefundPolicy.PROPORTIONAL,
    refundedAt: null,
    chargedAt: new Date(),
    stripePaymentIntentId: 'cs_test_123',
    budgetCents: 1000,
    currency: 'EUR',
    ...overrides,
  };
}

describe('ManagePromotionUseCase.cancelPromotion', () => {
  let useCase: ManagePromotionUseCase;

  const mockPrismaService = {
    promotion: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const mockStripeService = {
    expireCheckoutSession: vi.fn(),
  };
  const mockRefundPromotionUseCase = {
    execute: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManagePromotionUseCase,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
        {
          provide: RefundPromotionUseCase,
          useValue: mockRefundPromotionUseCase,
        },
      ],
    }).compile();

    useCase = module.get<ManagePromotionUseCase>(ManagePromotionUseCase);
    vi.clearAllMocks();
  });

  it('throws NotFoundException when the promotion is not owned by the user', async () => {
    mockPrismaService.promotion.findFirst.mockResolvedValue(null);

    await expect(useCase.cancelPromotion('user-1', 'promo-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delegates the refund to RefundPromotionUseCase and records the resulting Transaction', async () => {
    // This is the ledger-consistency fix: previously this path refunded via
    // Stripe directly and never wrote a Transaction row.
    mockPrismaService.promotion.findFirst.mockResolvedValue(basePromo());
    mockRefundPromotionUseCase.execute.mockResolvedValue({
      refunded: true,
      amount: 10,
      currency: 'EUR',
    });
    mockPrismaService.promotion.update.mockResolvedValue(
      basePromo({ status: PromotionStatus.CANCELLED }),
    );

    const result = await useCase.cancelPromotion('user-1', 'promo-1');

    expect(mockRefundPromotionUseCase.execute).toHaveBeenCalledWith(
      'promo-1',
      'user-cancel',
    );
    expect(result.refund).toEqual({
      amountCents: 1000,
      amount: 10,
      currency: 'EUR',
      status: 'succeeded',
    });
    expect(mockPrismaService.promotion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PromotionStatus.CANCELLED,
          refundedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('skips the refund without calling Stripe when refundPolicy is NONE', async () => {
    mockPrismaService.promotion.findFirst.mockResolvedValue(
      basePromo({ refundPolicy: PromotionRefundPolicy.NONE }),
    );
    mockPrismaService.promotion.update.mockResolvedValue(
      basePromo({ status: PromotionStatus.CANCELLED }),
    );

    const result = await useCase.cancelPromotion('user-1', 'promo-1');

    expect(mockRefundPromotionUseCase.execute).not.toHaveBeenCalled();
    expect(result.refund.status).toBe('skipped_policy');
  });

  it('reports skipped_unpaid when the checkout session had nothing to refund', async () => {
    mockPrismaService.promotion.findFirst.mockResolvedValue(basePromo());
    mockRefundPromotionUseCase.execute.mockResolvedValue({
      refunded: false,
      reason: 'skipped_unpaid',
    });
    mockPrismaService.promotion.update.mockResolvedValue(
      basePromo({ status: PromotionStatus.CANCELLED }),
    );

    const result = await useCase.cancelPromotion('user-1', 'promo-1');

    expect(result.refund.status).toBe('skipped_unpaid');
  });

  it('leaves refund status as none when RefundPromotionUseCase reports no_remaining_budget', async () => {
    mockPrismaService.promotion.findFirst.mockResolvedValue(basePromo());
    mockRefundPromotionUseCase.execute.mockResolvedValue({
      refunded: false,
      reason: 'no_remaining_budget',
    });
    mockPrismaService.promotion.update.mockResolvedValue(
      basePromo({ status: PromotionStatus.CANCELLED }),
    );

    const result = await useCase.cancelPromotion('user-1', 'promo-1');

    expect(result.refund.status).toBe('none');
  });

  it('throws BadRequestException and does not cancel when the refund attempt errors', async () => {
    mockPrismaService.promotion.findFirst.mockResolvedValue(basePromo());
    mockRefundPromotionUseCase.execute.mockRejectedValue(
      new Error('stripe down'),
    );

    await expect(useCase.cancelPromotion('user-1', 'promo-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(mockPrismaService.promotion.update).not.toHaveBeenCalled();
  });

  it('never calls RefundPromotionUseCase for a never-charged PENDING promotion, expiring the checkout instead', async () => {
    mockPrismaService.promotion.findFirst.mockResolvedValue(
      basePromo({
        status: PromotionStatus.PENDING,
        chargedAt: null,
      }),
    );
    mockPrismaService.promotion.update.mockResolvedValue(
      basePromo({ status: PromotionStatus.CANCELLED }),
    );

    const result = await useCase.cancelPromotion('user-1', 'promo-1');

    expect(mockStripeService.expireCheckoutSession).toHaveBeenCalledWith(
      'cs_test_123',
    );
    expect(mockRefundPromotionUseCase.execute).not.toHaveBeenCalled();
    expect(result.refund.status).toBe('none');
  });

  it('returns early for an already-CANCELLED promotion without calling the refund use-case', async () => {
    mockPrismaService.promotion.findFirst.mockResolvedValue(
      basePromo({ status: PromotionStatus.CANCELLED, refundedAt: new Date() }),
    );

    const result = await useCase.cancelPromotion('user-1', 'promo-1');

    expect(mockRefundPromotionUseCase.execute).not.toHaveBeenCalled();
    expect(result.refund.status).toBe('already_refunded');
  });
});
