import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MonetizationController } from './monetization.controller.js';
import { MonetizationService } from './monetization.service.js';

describe('MonetizationController', () => {
  let controller: MonetizationController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const req = { user: mockUser } as Parameters<
    MonetizationController['getMonetization']
  >[0];

  const mockService = {
    getMonetization: vi.fn(),
    getTransactions: vi.fn(),
    getAccountStatus: vi.fn(),
    onboardConnectAccount: vi.fn(),
    createTipSession: vi.fn(),
    createPostUnlockSession: vi.fn(),
    createStoryUnlockSession: vi.fn(),
    createMessageUnlockSession: vi.fn(),
    getDashboardLink: vi.fn(),
    getConnectPayoutsSummary: vi.fn(),
    getIncomeStats: vi.fn(),
    getFinancialSummary: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonetizationController],
      providers: [{ provide: MonetizationService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(IdentityVerifiedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MonetizationController>(MonetizationController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reads account, status, dashboard, payouts and analytics as the caller userId', async () => {
    mockService.getMonetization.mockResolvedValue({ id: 'mon-1' });
    mockService.getAccountStatus.mockResolvedValue({ connected: true });
    mockService.getDashboardLink.mockResolvedValue({
      url: 'https://example.com',
    });
    mockService.getConnectPayoutsSummary.mockResolvedValue({ payouts: [] });
    mockService.getIncomeStats.mockResolvedValue({ totalCents: 0 });
    mockService.getFinancialSummary.mockResolvedValue({ balanceCents: 0 });

    await controller.getMonetization(req);
    await controller.getStatus(req);
    await controller.getDashboard(req);
    await controller.getPayouts(req);
    await controller.getIncomeAnalytics(req);
    await controller.getFinancialSummary(req);

    expect(mockService.getMonetization).toHaveBeenCalledWith('user-1');
    expect(mockService.getAccountStatus).toHaveBeenCalledWith('user-1');
    expect(mockService.getDashboardLink).toHaveBeenCalledWith('user-1');
    expect(mockService.getConnectPayoutsSummary).toHaveBeenCalledWith('user-1');
    expect(mockService.getIncomeStats).toHaveBeenCalledWith('user-1');
    expect(mockService.getFinancialSummary).toHaveBeenCalledWith('user-1');
  });

  it('lists transactions as the caller userId with page and limit', async () => {
    mockService.getTransactions.mockResolvedValue({ data: [] });

    await controller.getTransactions(req, { page: 2, limit: 20 });

    expect(mockService.getTransactions).toHaveBeenCalledWith('user-1', 2, 20);
  });

  it('starts Connect onboarding as the caller userId and unwraps urls', async () => {
    mockService.onboardConnectAccount.mockResolvedValue({
      url: 'https://example.com',
    });

    await controller.connectStripe(req, {
      returnUrl: 'https://example.com/return',
      refreshUrl: 'https://example.com/refresh',
    });

    expect(mockService.onboardConnectAccount).toHaveBeenCalledWith(
      'user-1',
      'https://example.com/return',
      'https://example.com/refresh',
    );
  });

  it('starts a tip session as the caller userId and forwards the body fields', async () => {
    mockService.createTipSession.mockResolvedValue({
      url: 'https://example.com',
    });

    await controller.sendTip(req, {
      receiverId: 'receiver-1',
      amountCents: 100,
      returnUrl: 'https://example.com/return',
      postId: 'post-1',
      idempotencyKey: 'tip-1',
    });

    expect(mockService.createTipSession).toHaveBeenCalledWith(
      'user-1',
      'receiver-1',
      100,
      'https://example.com/return',
      'post-1',
      'tip-1',
    );
  });

  it('starts a post unlock as the caller userId and profileId', async () => {
    mockService.createPostUnlockSession.mockResolvedValue({
      url: 'https://example.com',
    });

    await controller.unlockPost(req, {
      postId: 'post-1',
      returnUrl: 'https://example.com/return',
      idempotencyKey: 'unlock-1',
    });

    expect(mockService.createPostUnlockSession).toHaveBeenCalledWith(
      'user-1',
      'profile-1',
      'post-1',
      'https://example.com/return',
      'unlock-1',
    );
  });

  it('starts a story unlock as the caller userId and profileId', async () => {
    mockService.createStoryUnlockSession.mockResolvedValue({
      url: 'https://example.com',
    });

    await controller.unlockStory(req, {
      storyId: 'story-1',
      returnUrl: 'https://example.com/return',
      idempotencyKey: 'unlock-s-1',
    });

    expect(mockService.createStoryUnlockSession).toHaveBeenCalledWith(
      'user-1',
      'profile-1',
      'story-1',
      'https://example.com/return',
      'unlock-s-1',
    );
  });

  it('starts a message unlock as the caller userId without profileId', async () => {
    mockService.createMessageUnlockSession.mockResolvedValue({
      url: 'https://example.com',
    });

    await controller.unlockMessage(req, {
      messageId: 'msg-1',
      returnUrl: 'https://example.com/return',
    });

    expect(mockService.createMessageUnlockSession).toHaveBeenCalledWith(
      'user-1',
      'msg-1',
      'https://example.com/return',
    );
  });
});
