import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { MonetizationController } from './monetization.controller.js';
import { MonetizationService } from './monetization.service.js';

describe('MonetizationController', () => {
  let app: INestApplication;

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

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [MonetizationController],
      providers: [{ provide: MonetizationService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: IdentityVerifiedGuard, mode: 'session' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects monetization reads without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/monetization').expect(401);
    expect(mockService.getMonetization).not.toHaveBeenCalled();
  });

  it('reads account, status, dashboard, payouts and analytics as the session userId', async () => {
    mockService.getMonetization.mockResolvedValue({ id: 'mon-1' });
    mockService.getAccountStatus.mockResolvedValue({ connected: true });
    mockService.getDashboardLink.mockResolvedValue({
      url: 'https://example.com',
    });
    mockService.getConnectPayoutsSummary.mockResolvedValue({ payouts: [] });
    mockService.getIncomeStats.mockResolvedValue({ totalCents: 0 });
    mockService.getFinancialSummary.mockResolvedValue({ balanceCents: 0 });

    const account = await request(app.getHttpServer())
      .get('/api/v1/monetization')
      .set(BEARER)
      .expect(200);
    expect(account.body).toEqual({ id: 'mon-1' });

    await request(app.getHttpServer())
      .get('/api/v1/monetization/status')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/monetization/dashboard')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/monetization/payouts')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/monetization/analytics/income')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/monetization/analytics/summary')
      .set(BEARER)
      .expect(200);

    expect(mockService.getMonetization).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockService.getAccountStatus).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockService.getDashboardLink).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockService.getConnectPayoutsSummary).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
    expect(mockService.getIncomeStats).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockService.getFinancialSummary).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
  });

  it('lists transactions as the session userId with page and limit', async () => {
    mockService.getTransactions.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/monetization/transactions')
      .query({ page: 2, limit: 20 })
      .set(BEARER)
      .expect(200);

    expect(mockService.getTransactions).toHaveBeenCalledWith(
      TEST_USER.userId,
      2,
      20,
    );
  });

  it('starts Connect onboarding as the session userId', async () => {
    mockService.onboardConnectAccount.mockResolvedValue({
      url: 'https://example.com',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/monetization/connect')
      .set(BEARER)
      .send({
        returnUrl: 'https://example.com/return',
        refreshUrl: 'https://example.com/refresh',
      })
      .expect(201);

    expect(res.body).toEqual({ url: 'https://example.com' });
    expect(mockService.onboardConnectAccount).toHaveBeenCalledWith(
      TEST_USER.userId,
      'https://example.com/return',
      'https://example.com/refresh',
    );
  });

  it('rejects a tip with a non-whitelisted amount override', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/monetization/tip')
      .set(BEARER)
      .send({
        receiverId: 'receiver-1',
        amountCents: 100,
        returnUrl: 'https://example.com/return',
        clientPriceCents: 1,
      })
      .expect(400);

    expect(mockService.createTipSession).not.toHaveBeenCalled();
  });

  it('starts a tip session as the session userId', async () => {
    mockService.createTipSession.mockResolvedValue({
      url: 'https://example.com',
    });

    await request(app.getHttpServer())
      .post('/api/v1/monetization/tip')
      .set(BEARER)
      .send({
        receiverId: 'receiver-1',
        amountCents: 100,
        returnUrl: 'https://example.com/return',
        postId: 'post-1',
        idempotencyKey: 'tip-1',
      })
      .expect(201);

    expect(mockService.createTipSession).toHaveBeenCalledWith(
      TEST_USER.userId,
      'receiver-1',
      100,
      'https://example.com/return',
      'post-1',
      'tip-1',
    );
  });

  it('starts a post unlock as the session userId and profileId', async () => {
    mockService.createPostUnlockSession.mockResolvedValue({
      url: 'https://example.com',
    });

    await request(app.getHttpServer())
      .post('/api/v1/monetization/unlock')
      .set(BEARER)
      .send({
        postId: 'post-1',
        returnUrl: 'https://example.com/return',
        idempotencyKey: 'unlock-1',
      })
      .expect(201);

    expect(mockService.createPostUnlockSession).toHaveBeenCalledWith(
      TEST_USER.userId,
      TEST_USER.profileId,
      'post-1',
      'https://example.com/return',
      'unlock-1',
    );
  });

  it('starts a story unlock as the session userId and profileId', async () => {
    mockService.createStoryUnlockSession.mockResolvedValue({
      url: 'https://example.com',
    });

    await request(app.getHttpServer())
      .post('/api/v1/monetization/unlock-story')
      .set(BEARER)
      .send({
        storyId: 'story-1',
        returnUrl: 'https://example.com/return',
        idempotencyKey: 'unlock-s-1',
      })
      .expect(201);

    expect(mockService.createStoryUnlockSession).toHaveBeenCalledWith(
      TEST_USER.userId,
      TEST_USER.profileId,
      'story-1',
      'https://example.com/return',
      'unlock-s-1',
    );
  });

  it('starts a message unlock as the session userId', async () => {
    mockService.createMessageUnlockSession.mockResolvedValue({
      url: 'https://example.com',
    });

    await request(app.getHttpServer())
      .post('/api/v1/monetization/unlock-message')
      .set(BEARER)
      .send({
        messageId: 'msg-1',
        returnUrl: 'https://example.com/return',
      })
      .expect(201);

    expect(mockService.createMessageUnlockSession).toHaveBeenCalledWith(
      TEST_USER.userId,
      'msg-1',
      'https://example.com/return',
    );
  });
});
