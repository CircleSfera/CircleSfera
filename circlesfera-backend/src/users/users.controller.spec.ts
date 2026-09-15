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
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { DataExportService } from './data-export.service.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let app: INestApplication;

  const mockUsersService = {
    getSuggestions: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    deleteUser: vi.fn(),
    scheduleDeletion: vi.fn(),
    cancelScheduledDeletion: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    createIdentitySession: vi.fn(),
    syncIdentitySession: vi.fn(),
  };

  const mockExportService = {
    requestDataExport: vi.fn(),
    getExportHistory: vi.fn(),
    streamDataExport: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: DataExportService, useValue: mockExportService },
      ],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: JwtOptionalGuard, mode: 'optional' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
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

  it('rejects settings without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me/settings')
      .expect(401);

    expect(mockUsersService.getSettings).not.toHaveBeenCalled();
  });

  it('loads suggestions as the caller userId with default and parsed limit', async () => {
    mockUsersService.getSuggestions.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/users/suggestions')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/suggestions')
      .query({ limit: 5 })
      .set(BEARER)
      .expect(200);

    expect(mockUsersService.getSuggestions).toHaveBeenNthCalledWith(
      1,
      TEST_USER.userId,
      10,
    );
    expect(mockUsersService.getSuggestions).toHaveBeenNthCalledWith(
      2,
      TEST_USER.userId,
      5,
    );
  });

  it('rejects ban with a user session', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/user-2/ban')
      .set(BEARER)
      .expect(401);

    expect(mockUsersService.banUser).not.toHaveBeenCalled();
  });

  it('bans and unbans by user id without a staff identity', async () => {
    mockUsersService.banUser.mockResolvedValue({ id: 'user-2' });
    mockUsersService.unbanUser.mockResolvedValue({ id: 'user-2' });

    await request(app.getHttpServer())
      .patch('/api/v1/users/user-2/ban')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/users/user-2/unban')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockUsersService.banUser).toHaveBeenCalledWith('user-2');
    expect(mockUsersService.unbanUser).toHaveBeenCalledWith('user-2');
  });

  it('requests and lists GDPR exports as the caller userId', async () => {
    mockExportService.requestDataExport.mockResolvedValue({ id: 'export-1' });
    mockExportService.getExportHistory.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/users/gdpr/export')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/users/gdpr/exports')
      .set(BEARER)
      .expect(200);

    expect(mockExportService.requestDataExport).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
    expect(mockExportService.getExportHistory).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
  });

  it('downloads GDPR export as the caller userId or with signed token', async () => {
    mockExportService.streamDataExport.mockImplementation(
      async (_id, _userId, _token, res) => {
        res.status(200).send('mock-zip-content');
      },
    );

    await request(app.getHttpServer())
      .get('/api/v1/users/gdpr/exports/export-1/download')
      .set(BEARER)
      .expect(200);

    expect(mockExportService.streamDataExport).toHaveBeenLastCalledWith(
      'export-1',
      TEST_USER.userId,
      undefined,
      expect.anything(),
    );

    await request(app.getHttpServer())
      .get(
        '/api/v1/users/gdpr/exports/export-1/download?token=signed-token-123',
      )
      .expect(200);

    expect(mockExportService.streamDataExport).toHaveBeenLastCalledWith(
      'export-1',
      undefined,
      'signed-token-123',
      expect.anything(),
    );
  });

  it('deletes the account as the caller userId', async () => {
    mockUsersService.deleteUser.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .delete('/api/v1/users/gdpr/account')
      .set(BEARER)
      .expect(200);

    expect(mockUsersService.deleteUser).toHaveBeenCalledWith(TEST_USER.userId);
    expect(res.body).toEqual({ message: 'Account deleted successfully' });
  });

  it('schedules and cancels deletion as the caller userId', async () => {
    const when = new Date('2026-10-04T00:00:00.000Z');
    mockUsersService.scheduleDeletion.mockResolvedValue(when);
    mockUsersService.cancelScheduledDeletion.mockResolvedValue({ ok: true });

    const scheduled = await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/users/me/restore')
      .set(BEARER)
      .expect(201);

    expect(mockUsersService.scheduleDeletion).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
    expect(mockUsersService.cancelScheduledDeletion).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
    expect(scheduled.body).toEqual({
      success: true,
      message: 'Account scheduled for deletion',
      scheduled_deletion_at: when.toISOString(),
    });
  });

  it('rejects settings update with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/users/me/settings')
      .set(BEARER)
      .send({ privacyLevel: 'FOLLOWERS', role: 'ADMIN' })
      .expect(400);

    expect(mockUsersService.updateSettings).not.toHaveBeenCalled();
  });

  it('reads and updates settings as the caller userId', async () => {
    const dto = { privacyLevel: 'FOLLOWERS' };
    mockUsersService.getSettings.mockResolvedValue({});
    mockUsersService.updateSettings.mockResolvedValue({});

    await request(app.getHttpServer())
      .get('/api/v1/users/me/settings')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/users/me/settings')
      .set(BEARER)
      .send(dto)
      .expect(200);

    expect(mockUsersService.getSettings).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockUsersService.updateSettings).toHaveBeenCalledWith(
      TEST_USER.userId,
      dto,
    );
  });

  it('starts identity verification as the caller userId with an explicit returnUrl', async () => {
    mockUsersService.createIdentitySession.mockResolvedValue({
      url: 'https://example.com/verify',
    });

    await request(app.getHttpServer())
      .post('/api/v1/users/identity-session')
      .set(BEARER)
      .send({ returnUrl: 'https://example.com/return' })
      .expect(201);

    expect(mockUsersService.createIdentitySession).toHaveBeenCalledWith(
      TEST_USER.userId,
      'https://example.com/return',
    );
  });

  it('starts identity verification with the frontend account fallback', async () => {
    mockUsersService.createIdentitySession.mockResolvedValue({
      url: 'https://example.com/verify',
    });
    const fallback = `${
      process.env.FRONTEND_URL || 'http://localhost:5173'
    }/accounts/account`;

    await request(app.getHttpServer())
      .post('/api/v1/users/identity-session')
      .set(BEARER)
      .send({})
      .expect(201);

    expect(mockUsersService.createIdentitySession).toHaveBeenCalledWith(
      TEST_USER.userId,
      fallback,
    );
  });

  it('syncs identity verification as the caller userId', async () => {
    mockUsersService.syncIdentitySession.mockResolvedValue({ status: 'ok' });

    await request(app.getHttpServer())
      .post('/api/v1/users/identity-session/sync')
      .set(BEARER)
      .expect(201);

    expect(mockUsersService.syncIdentitySession).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
  });
});
