import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
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
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
} from '../common/config/cookie.config.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';

function setCookies(res: { headers: { [key: string]: unknown } }): string[] {
  const raw = res.headers['set-cookie'];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') return [raw];
  return [];
}

describe('AdminAuthController', () => {
  let app: INestApplication;

  const tokens = {
    accessToken: 'admin-access-test',
    refreshToken: 'admin-refresh-test',
  };

  const mockService = {
    login: vi.fn(),
    verifyMfa: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    stepUp: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminAuthController],
      providers: [{ provide: AdminAuthService, useValue: mockService }],
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: ThrottlerGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects me without credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin-auth/me').expect(401);

    expect(mockService.me).not.toHaveBeenCalled();
  });

  it('rejects me with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin-auth/me')
      .set(BEARER)
      .expect(401);

    expect(mockService.me).not.toHaveBeenCalled();
  });

  it('rejects login with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin-auth/login')
      .send({
        email: 'admin@example.com',
        password: 'password1',
        extra: 'nope',
      })
      .expect(400);

    expect(mockService.login).not.toHaveBeenCalled();
  });

  it('rejects MFA verify with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin-auth/mfa/verify')
      .send({
        mfaToken: 'mfa-token-1',
        code: '123456',
        extra: 'nope',
      })
      .expect(400);

    expect(mockService.verifyMfa).not.toHaveBeenCalled();
  });

  it('rejects step-up with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin-auth/step-up')
      .set(ADMIN_BEARER)
      .send({ password: 'password1', extra: 'nope' })
      .expect(400);

    expect(mockService.stepUp).not.toHaveBeenCalled();
  });

  it('logs in without admin credentials, sets cookies, and returns OK', async () => {
    mockService.login.mockResolvedValue({ status: 'OK', tokens });

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin-auth/login')
      .set('User-Agent', 'Vitest')
      .send({ email: 'admin@example.com', password: 'password1' })
      .expect(200);

    expect(res.body).toEqual({
      message: 'Login successful',
      status: 'OK',
    });
    const cookies = setCookies(res);
    expect(
      cookies.some((c) =>
        c.includes(`${ADMIN_ACCESS_TOKEN_COOKIE}=admin-access-test`),
      ),
    ).toBe(true);
    expect(
      cookies.some((c) =>
        c.includes(`${ADMIN_REFRESH_TOKEN_COOKIE}=admin-refresh-test`),
      ),
    ).toBe(true);
    expect(mockService.login).toHaveBeenCalledWith(
      'admin@example.com',
      'password1',
      expect.objectContaining({ userAgent: 'Vitest' }),
    );
  });

  it('returns MFA required without setting cookies', async () => {
    mockService.login.mockResolvedValue({
      status: 'MFA_REQUIRED',
      mfaToken: 'mfa-token-1',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin-auth/login')
      .send({ email: 'admin@example.com', password: 'password1' })
      .expect(200);

    expect(res.body).toEqual({
      status: 'MFA_REQUIRED',
      mfaToken: 'mfa-token-1',
    });
    expect(setCookies(res).join('')).not.toContain(
      `${ADMIN_ACCESS_TOKEN_COOKIE}=`,
    );
  });

  it('forwards MFA setup fields without setting cookies', async () => {
    mockService.login.mockResolvedValue({
      status: 'MFA_SETUP_REQUIRED',
      mfaToken: 'mfa-token-1',
      otpauthUrl: 'otpauth://test',
      secret: 'setup-secret-test',
      qrCodeDataUrl: 'data:image/png;base64,test',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin-auth/login')
      .send({ email: 'admin@example.com', password: 'password1' })
      .expect(200);

    expect(res.body).toEqual({
      status: 'MFA_SETUP_REQUIRED',
      mfaToken: 'mfa-token-1',
      otpauthUrl: 'otpauth://test',
      secret: 'setup-secret-test',
      qrCodeDataUrl: 'data:image/png;base64,test',
    });
    expect(setCookies(res).join('')).not.toContain(
      `${ADMIN_ACCESS_TOKEN_COOKIE}=`,
    );
  });

  it('verifies MFA and sets admin cookies', async () => {
    mockService.verifyMfa.mockResolvedValue(tokens);

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin-auth/mfa/verify')
      .set('User-Agent', 'Vitest')
      .send({ mfaToken: 'mfa-token-1', code: '123456' })
      .expect(200);

    expect(res.body).toEqual({
      message: 'Login successful',
      status: 'OK',
    });
    const cookies = setCookies(res);
    expect(
      cookies.some((c) =>
        c.includes(`${ADMIN_ACCESS_TOKEN_COOKIE}=admin-access-test`),
      ),
    ).toBe(true);
    expect(mockService.verifyMfa).toHaveBeenCalledWith(
      'mfa-token-1',
      '123456',
      expect.objectContaining({ userAgent: 'Vitest' }),
    );
  });

  it('refreshes from the admin refresh cookie', async () => {
    mockService.refresh.mockResolvedValue(tokens);

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin-auth/refresh')
      .set('User-Agent', 'Vitest')
      .set('Cookie', `${ADMIN_REFRESH_TOKEN_COOKIE}=admin-refresh-cookie`)
      .expect(200);

    expect(res.body).toEqual({ message: 'Token refreshed' });
    expect(mockService.refresh).toHaveBeenCalledWith(
      'admin-refresh-cookie',
      expect.objectContaining({ userAgent: 'Vitest' }),
    );
  });

  it('logs out as adminId, uses the refresh cookie, and clears cookies', async () => {
    mockService.logout.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin-auth/logout')
      .set(ADMIN_BEARER)
      .set('User-Agent', 'Vitest')
      .set('Cookie', `${ADMIN_REFRESH_TOKEN_COOKIE}=admin-refresh-cookie`)
      .expect(200);

    expect(res.body).toEqual({ message: 'Logged out' });
    const cookies = setCookies(res).join(';');
    expect(cookies).toContain(ADMIN_ACCESS_TOKEN_COOKIE);
    expect(cookies).toContain(ADMIN_REFRESH_TOKEN_COOKIE);
    expect(mockService.logout).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'admin-refresh-cookie',
      expect.objectContaining({ userAgent: 'Vitest' }),
    );
  });

  it('reads me and sessions as adminId', async () => {
    mockService.me.mockResolvedValue({ id: TEST_ADMIN.adminId });
    mockService.listSessions.mockResolvedValue([]);

    const me = await request(app.getHttpServer())
      .get('/api/v1/admin-auth/me')
      .set(ADMIN_BEARER)
      .expect(200);
    expect(me.body).toEqual({ id: TEST_ADMIN.adminId });

    await request(app.getHttpServer())
      .get('/api/v1/admin-auth/sessions')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.me).toHaveBeenCalledWith(TEST_ADMIN.adminId);
    expect(mockService.listSessions).toHaveBeenCalledWith(TEST_ADMIN.adminId);
  });

  it('revokes a session as adminId', async () => {
    mockService.revokeSession.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .delete('/api/v1/admin-auth/sessions/session-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.body).toEqual({ message: 'Session revoked' });
    expect(mockService.revokeSession).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'session-1',
    );
  });

  it('steps up as adminId and refreshes only the access cookie', async () => {
    mockService.stepUp.mockResolvedValue({
      accessToken: 'admin-access-step',
    });
    const dto = { password: 'password1' };

    const res = await request(app.getHttpServer())
      .post('/api/v1/admin-auth/step-up')
      .set(ADMIN_BEARER)
      .send(dto)
      .expect(200);

    expect(res.body).toEqual({ message: 'Step-up verified' });
    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain(
      `${ADMIN_ACCESS_TOKEN_COOKIE}=admin-access-step`,
    );
    expect(cookies[0]).not.toContain(ADMIN_REFRESH_TOKEN_COOKIE);
    expect(mockService.stepUp).toHaveBeenCalledWith(TEST_ADMIN.adminId, dto);
  });
});
