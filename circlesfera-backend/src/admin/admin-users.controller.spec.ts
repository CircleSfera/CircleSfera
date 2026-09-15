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
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';

describe('AdminUsersController', () => {
  let app: INestApplication;

  const mockService = {
    sendBroadcastEmail: vi.fn(),
    exportUsersCSV: vi.fn(),
    getUsers: vi.fn(),
    getKycStats: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    updateUserRole: vi.fn(),
    updateUserStatus: vi.fn(),
    revokeUserKYC: vi.fn(),
    syncUserKYC: vi.fn(),
    deleteUser: vi.fn(),
    getWhitelist: vi.fn(),
    createWhitelist: vi.fn(),
    updateWhitelist: vi.fn(),
    deleteWhitelist: vi.fn(),
    warnUser: vi.fn(),
    suspendUser: vi.fn(),
    restoreUser: vi.fn(),
    getUserDetail: vi.fn(),
    getLinkedAccounts: vi.fn(),
    getTrustScore: vi.fn(),
    applyBotLabel: vi.fn(),
    clearBotLabel: vi.fn(),
    getSignupFunnelStats: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminUsersController],
      providers: [{ provide: AdminUsersService, useValue: mockService }],
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: AdminGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects users list without credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);

    expect(mockService.getUsers).not.toHaveBeenCalled();
  });

  it('rejects users list with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set(BEARER)
      .expect(401);

    expect(mockService.getUsers).not.toHaveBeenCalled();
  });

  it('rejects broadcast with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/broadcast')
      .set(ADMIN_BEARER)
      .send({
        subject: 'Hello',
        title: 'Hi',
        content: 'Body',
        extra: 'nope',
      })
      .expect(400);

    expect(mockService.sendBroadcastEmail).not.toHaveBeenCalled();
  });

  it('rejects status update with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/status')
      .set(ADMIN_BEARER)
      .send({ isActive: false, extra: true })
      .expect(400);

    expect(mockService.updateUserStatus).not.toHaveBeenCalled();
  });

  it('rejects whitelist create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/whitelist')
      .set(ADMIN_BEARER)
      .send({ email: 'invite@example.com', extra: 'nope' })
      .expect(400);

    expect(mockService.createWhitelist).not.toHaveBeenCalled();
  });

  it('rejects whitelist update with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/whitelist/wl-1')
      .set(ADMIN_BEARER)
      .send({ status: 'REGISTERED', extra: 'nope' })
      .expect(400);

    expect(mockService.updateWhitelist).not.toHaveBeenCalled();
  });

  it('lists users with the query fields and no actor', async () => {
    mockService.getUsers.mockResolvedValue({ data: [] });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .query({
        page: 2,
        limit: 20,
        search: 'ada',
        status: 'ACTIVE',
        role: 'USER',
        kycStatus: 'verified',
      })
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.body).toEqual({ data: [] });
    expect(mockService.getUsers).toHaveBeenCalledWith(
      2,
      20,
      'ada',
      'ACTIVE',
      'USER',
      'verified',
    );
  });

  it('reads KYC, detail, linked accounts, trust and funnel', async () => {
    mockService.getKycStats.mockResolvedValue({});
    mockService.getUserDetail.mockResolvedValue({ id: 'user-2' });
    mockService.getLinkedAccounts.mockResolvedValue([]);
    mockService.getTrustScore.mockResolvedValue({ score: 1 });
    mockService.getSignupFunnelStats.mockResolvedValue({});

    await request(app.getHttpServer())
      .get('/api/v1/admin/users/kyc/stats')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/users/user-2/detail')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/users/user-2/linked-accounts')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/users/user-2/trust-score')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/trust/funnel')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getKycStats).toHaveBeenCalledWith();
    expect(mockService.getUserDetail).toHaveBeenCalledWith('user-2');
    expect(mockService.getLinkedAccounts).toHaveBeenCalledWith('user-2');
    expect(mockService.getTrustScore).toHaveBeenCalledWith('user-2');
    expect(mockService.getSignupFunnelStats).toHaveBeenCalledWith();
  });

  it('exports users CSV without an actor', async () => {
    mockService.exportUsersCSV.mockResolvedValue('id,email\n');

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users/export')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toBe('id,email\n');
    expect(mockService.exportUsersCSV).toHaveBeenCalledWith();
  });

  it('broadcasts as adminId', async () => {
    const dto = { subject: 'Hello', title: 'Hi', content: 'Body' };
    mockService.sendBroadcastEmail.mockResolvedValue({ ok: true });

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/broadcast')
      .set(ADMIN_BEARER)
      .send(dto)
      .expect(201);

    expect(res.body).toEqual({ ok: true });
    expect(mockService.sendBroadcastEmail).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      dto,
    );
  });

  it('bans, unbans and deletes as adminId', async () => {
    mockService.banUser.mockResolvedValue({ id: 'user-2' });
    mockService.unbanUser.mockResolvedValue({ id: 'user-2' });
    mockService.deleteUser.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/ban')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/unban')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/users/user-2')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.banUser).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
    );
    expect(mockService.unbanUser).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
    );
    expect(mockService.deleteUser).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
    );
  });

  it('updates role, status and KYC as adminId', async () => {
    const status = { isActive: false };
    mockService.updateUserRole.mockResolvedValue({ id: 'user-2' });
    mockService.updateUserStatus.mockResolvedValue({ id: 'user-2' });
    mockService.revokeUserKYC.mockResolvedValue({ id: 'user-2' });
    mockService.syncUserKYC.mockResolvedValue({ id: 'user-2' });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/role')
      .set(ADMIN_BEARER)
      .send({ role: 'MODERATOR' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/status')
      .set(ADMIN_BEARER)
      .send(status)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/admin/users/user-2/revoke-kyc')
      .set(ADMIN_BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/users/user-2/sync-kyc')
      .set(ADMIN_BEARER)
      .expect(201);

    expect(mockService.updateUserRole).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
      'MODERATOR',
    );
    expect(mockService.updateUserStatus).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
      status,
    );
    expect(mockService.revokeUserKYC).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
    );
    expect(mockService.syncUserKYC).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
    );
  });

  it('lists whitelist with defaults and mutates as adminId', async () => {
    const createDto = { email: 'invite@example.com' };
    const updateDto = { status: 'REGISTERED' as const };
    mockService.getWhitelist.mockResolvedValue({ data: [] });
    mockService.createWhitelist.mockResolvedValue({ id: 'wl-1' });
    mockService.updateWhitelist.mockResolvedValue({ id: 'wl-1' });
    mockService.deleteWhitelist.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .get('/api/v1/admin/whitelist')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/admin/whitelist')
      .set(ADMIN_BEARER)
      .send(createDto)
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/whitelist/wl-1')
      .set(ADMIN_BEARER)
      .send(updateDto)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/whitelist/wl-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getWhitelist).toHaveBeenCalledWith(1, 10, undefined);
    expect(mockService.createWhitelist).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      createDto,
    );
    expect(mockService.updateWhitelist).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'wl-1',
      updateDto,
    );
    expect(mockService.deleteWhitelist).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'wl-1',
    );
  });

  it('warns, suspends with default days, and restores as adminId', async () => {
    mockService.warnUser.mockResolvedValue({ id: 'user-2' });
    mockService.suspendUser.mockResolvedValue({ id: 'user-2' });
    mockService.restoreUser.mockResolvedValue({ id: 'user-2' });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/warn')
      .set(ADMIN_BEARER)
      .send({ reason: 'spam' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/suspend')
      .set(ADMIN_BEARER)
      .send({ reason: 'abuse' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/suspend')
      .set(ADMIN_BEARER)
      .send({ days: 3, reason: 'abuse' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user-2/restore')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.warnUser).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
      'spam',
    );
    expect(mockService.suspendUser).toHaveBeenNthCalledWith(
      1,
      TEST_ADMIN.adminId,
      'user-2',
      7,
      'abuse',
    );
    expect(mockService.suspendUser).toHaveBeenNthCalledWith(
      2,
      TEST_ADMIN.adminId,
      'user-2',
      3,
      'abuse',
    );
    expect(mockService.restoreUser).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
    );
  });

  it('applies and clears a bot label as adminId', async () => {
    mockService.applyBotLabel.mockResolvedValue({ id: 'user-2' });
    mockService.clearBotLabel.mockResolvedValue({ id: 'user-2' });

    await request(app.getHttpServer())
      .post('/api/v1/admin/users/user-2/bot-label')
      .set(ADMIN_BEARER)
      .send({ reason: 'automation' })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/admin/users/user-2/bot-label')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.applyBotLabel).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
      'automation',
    );
    expect(mockService.clearBotLabel).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'user-2',
    );
  });
});
