import { ErrorCode } from '@circlesfera/shared';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../../../../common/stripe/stripe.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { CreatePromotionUseCase } from './create-promotion.use-case.js';

// Whoever pays here is an adult, unless a test says otherwise; the rule is
// tested on its own (adult-payer.policy.spec.ts).
const adultPayer = vi.hoisted(() => ({
  assertAdultPayer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../common/policies/adult-payer.policy.js', () => adultPayer);

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
    assertPaymentsEnabled: vi.fn().mockResolvedValue(undefined),
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

    // Only one's own post that passed moderation and is published.
    expect(mockPrismaService.post.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'post-100',
        profileId: { in: ['p-1'] },
        moderationStatus: 'VISIBLE',
        moderationPassedAt: { not: null },
        deletedAt: null,
        archivedAt: null,
        scheduledStatus: 'PUBLISHED',
      },
      select: { id: true },
    });
    expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              // €50 a day for 7 days, worked out by the server.
              unit_amount: 35000,
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
    expect(mockPrismaService.promotion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          budgetCents: 35000,
          dailyBudgetCents: 5000,
        }),
      }),
    );
    // Whoever pays is an adult with a verified identity.
    expect(adultPayer.assertAdultPayer).toHaveBeenCalledWith(
      expect.anything(),
      'u-1',
    );
  });

  it('creates no promotion when whoever pays is not an adult', async () => {
    adultPayer.assertAdultPayer.mockRejectedValueOnce(
      Object.assign(new Error('under age'), { errorCode: 'PAYER_UNDER_AGE' }),
    );
    await expect(
      useCase.execute('u-1', 'post', 'post-100', 7, 50),
    ).rejects.toMatchObject({ errorCode: 'PAYER_UNDER_AGE' });
    expect(mockPrismaService.promotion.create).not.toHaveBeenCalled();
    expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('writes down no promotion while payments are paused', async () => {
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
    const paused = new Error('payments paused');
    mockStripeService.assertPaymentsEnabled.mockRejectedValueOnce(paused);

    await expect(
      useCase.execute('u-1', 'post', 'post-100', 7, 50),
    ).rejects.toBe(paused);
    expect(mockPrismaService.promotion.create).not.toHaveBeenCalled();
    expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects promotion when target post is not owned by user', async () => {
    mockPrismaService.profile.findMany.mockResolvedValue([{ id: 'p-1' }]);
    mockPrismaService.post.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute('u-1', 'post', 'post-unowned', 7, 50),
    ).rejects.toMatchObject({ errorCode: ErrorCode.POST_NOT_FOUND });

    expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
    expect(mockPrismaService.promotion.create).not.toHaveBeenCalled();
  });

  it('promotes nothing of a Profile banned or suspended now', async () => {
    // Only the account's Profiles in good standing come back.
    mockPrismaService.profile.findMany.mockResolvedValue([]);
    mockPrismaService.post.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute('u-1', 'post', 'post-of-suspended', 7, 50),
    ).rejects.toMatchObject({ errorCode: ErrorCode.POST_NOT_FOUND });
    expect(mockPrismaService.profile.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u-1',
        isAccountBanned: false,
        OR: [
          { suspendedUntil: null },
          { suspendedUntil: { lte: expect.any(Date) } },
        ],
      },
      select: { id: true },
    });
    expect(mockPrismaService.promotion.create).not.toHaveBeenCalled();
  });

  it('says to wait for content still being checked, and promotes nothing', async () => {
    mockPrismaService.profile.findMany.mockResolvedValue([{ id: 'p-1' }]);
    mockPrismaService.post.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'post-new' });

    await expect(
      useCase.execute('u-1', 'frame', 'post-new', 7, 50),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONTENT_UNDER_REVIEW });
    expect(mockPrismaService.post.findFirst).toHaveBeenLastCalledWith({
      where: {
        id: 'post-new',
        profileId: { in: ['p-1'] },
        moderationStatus: 'VISIBLE',
        moderationPassedAt: null,
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(mockPrismaService.promotion.create).not.toHaveBeenCalled();
  });

  it('promotes only a story of one’s own that passed moderation, and says when it is not found or still being checked', async () => {
    mockPrismaService.profile.findMany.mockResolvedValue([{ id: 'p-1' }]);
    mockPrismaService.story.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 's-new' });

    await expect(
      useCase.execute('u-1', 'story', 's-gone', 1, 10),
    ).rejects.toMatchObject({ errorCode: ErrorCode.STORY_NOT_FOUND });
    await expect(
      useCase.execute('u-1', 'story', 's-new', 1, 10),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONTENT_UNDER_REVIEW });
    expect(mockPrismaService.story.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 's-gone',
        profileId: { in: ['p-1'] },
        moderationStatus: 'VISIBLE',
        moderationPassedAt: { not: null },
        deletedAt: null,
        scheduledStatus: 'PUBLISHED',
      },
      select: { id: true },
    });
    expect(mockPrismaService.promotion.create).not.toHaveBeenCalled();
  });

  it('rejects promotion when target profile is not owned by user', async () => {
    mockPrismaService.profile.findMany.mockResolvedValue([{ id: 'p-1' }]);

    await expect(
      useCase.execute('u-1', 'profile', 'p-other', 3, 20),
    ).rejects.toMatchObject({ errorCode: ErrorCode.PROFILE_NOT_FOUND });

    expect(mockStripeService.createCheckoutSession).not.toHaveBeenCalled();
  });
});
