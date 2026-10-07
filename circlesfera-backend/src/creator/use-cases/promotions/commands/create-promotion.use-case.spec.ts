import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../../../../common/stripe/stripe.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { CreatePromotionUseCase } from './create-promotion.use-case.js';

describe('CreatePromotionUseCase', () => {
  let useCase: CreatePromotionUseCase;

  const mockPrismaService = {
    profile: {
      findMany: vi.fn(),
    },
    post: {
      findFirst: vi.fn(),
    },
    story: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    promotion: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockStripeService = {
    createCheckoutSession: vi.fn(),
    cardOnlyPaymentMethods: vi.fn(() => ({
      payment_method_configuration: 'pmc_cardonly',
    })),
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue('https://app.circlesfera.com'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatePromotionUseCase,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    useCase = module.get<CreatePromotionUseCase>(CreatePromotionUseCase);
  });

  it('creates promotion and checkout session when target post is owned by user', async () => {
    mockPrismaService.profile.findMany.mockResolvedValue([{ id: 'p-1' }]);
    mockPrismaService.post.findFirst.mockResolvedValue({
      id: 'post-100',
      profileId: 'p-1',
    });
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'u-1',
      email: 'creator@example.com',
      stripeCustomerId: 'cus_123',
    });
    mockPrismaService.promotion.create.mockResolvedValue({
      id: 'promo-123',
      userId: 'u-1',
    });
    mockStripeService.createCheckoutSession.mockResolvedValue({
      id: 'cs_123',
      url: 'https://checkout.stripe.com/pay/cs_123',
    });

    const result = await useCase.execute(
      'u-1',
      'post',
      'post-100',
      7,
      50,
      'EUR',
    );

    expect(mockPrismaService.post.findFirst).toHaveBeenCalledWith({
      where: { id: 'post-100', profileId: { in: ['p-1'] } },
    });
    expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 5000,
              product_data: expect.objectContaining({
                name: 'Promotion: POST',
                description: 'Promotion for 7 days',
              }),
            }),
          }),
        ],
      }),
    );
    expect(result.url).toBe('https://checkout.stripe.com/pay/cs_123');
  });

  it('rejects promotion when target post is not owned by user', async () => {
    mockPrismaService.profile.findMany.mockResolvedValue([{ id: 'p-1' }]);
    mockPrismaService.post.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute('u-1', 'post', 'post-unowned', 7, 50),
    ).rejects.toThrow('Post not found or not owned by user');

    expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    expect(mockPrismaService.promotion.create).not.toHaveBeenCalled();
  });

  it('rejects promotion when target profile is not owned by user', async () => {
    mockPrismaService.profile.findMany.mockResolvedValue([{ id: 'p-1' }]);

    await expect(
      useCase.execute('u-1', 'profile', 'p-other', 3, 20),
    ).rejects.toThrow('Cannot promote other users profile');

    expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
  });
});
