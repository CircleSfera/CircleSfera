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
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

const ABUSE_HEADERS = {
  'User-Agent': 'Vitest',
  'x-forwarded-for': '203.0.113.10',
  'cf-ipcountry': 'ES',
} as const;

const expectedAbuseMeta = {
  ip: '203.0.113.10',
  userAgent: 'Vitest',
  country: 'ES',
};

function cookieHeader(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  return Array.isArray(raw) ? raw.join('\n') : String(raw);
}

describe('AuthController', () => {
  let app: INestApplication;

  const tokens = {
    accessToken: 'access-test',
    refreshToken: 'refresh-test',
  };

  const mockService = {
    register: vi.fn(),
    login: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    getUserSessions: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSession: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockService }],
      guards: [
        { guard: ThrottlerGuard, mode: 'allow' },
        { guard: JwtAuthGuard, mode: 'session' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects logout without a session', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/logout').expect(401);

    expect(mockService.logout).not.toHaveBeenCalled();
  });

  it('rejects register with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set(ABUSE_HEADERS)
      .send({
        email: 'new@example.com',
        password: 'password1',
        username: 'newuser',
        dateOfBirth: '2000-01-01',
        role: 'ADMIN',
      })
      .expect(400);

    expect(mockService.register).not.toHaveBeenCalled();
  });

  it('registers and sets auth cookies', async () => {
    const dto = {
      email: 'new@example.com',
      password: 'password1',
      username: 'newuser',
      dateOfBirth: '2000-01-01',
    };
    mockService.register.mockResolvedValue(tokens);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set(ABUSE_HEADERS)
      .send(dto)
      .expect(201);

    expect(res.body).toEqual({ message: 'Registration successful' });
    expect(cookieHeader(res)).toContain('access_token=access-test');
    expect(cookieHeader(res)).toContain('refresh_token=refresh-test');
    expect(mockService.register).toHaveBeenCalledWith(dto, expectedAbuseMeta);
  });

  it('logs in and sets auth cookies', async () => {
    const dto = { identifier: 'newuser', password: 'password1' };
    mockService.login.mockResolvedValue(tokens);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set(ABUSE_HEADERS)
      .send(dto)
      .expect(200);

    expect(res.body).toEqual({ message: 'Login successful' });
    expect(cookieHeader(res)).toContain('access_token=access-test');
    expect(cookieHeader(res)).toContain('refresh_token=refresh-test');
    expect(mockService.login).toHaveBeenCalledWith(dto, expectedAbuseMeta);
  });

  it('refreshes from the refresh cookie before the body', async () => {
    mockService.refreshToken.mockResolvedValue(tokens);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(ABUSE_HEADERS)
      .set('Cookie', 'refresh_token=cookie-refresh')
      .send({ refreshToken: 'body-refresh' })
      .expect(200);

    expect(res.body).toEqual({ message: 'Tokens refreshed' });
    expect(cookieHeader(res)).toContain('access_token=access-test');
    expect(cookieHeader(res)).toContain('refresh_token=refresh-test');
    expect(mockService.refreshToken).toHaveBeenCalledWith(
      { refreshToken: 'cookie-refresh' },
      expectedAbuseMeta,
    );
  });

  it('refreshes from the body when the cookie is absent', async () => {
    mockService.refreshToken.mockResolvedValue(tokens);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(ABUSE_HEADERS)
      .send({ refreshToken: 'body-refresh' })
      .expect(200);

    expect(mockService.refreshToken).toHaveBeenCalledWith(
      { refreshToken: 'body-refresh' },
      expectedAbuseMeta,
    );
  });

  it('logs out the caller userId, prefers the cookie, and clears cookies', async () => {
    mockService.logout.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set(BEARER)
      .set('Cookie', 'refresh_token=cookie-refresh')
      .send({ refreshToken: 'body-refresh' })
      .expect(204);

    expect(cookieHeader(res)).toContain('access_token=');
    expect(cookieHeader(res)).toContain('refresh_token=');
    expect(mockService.logout).toHaveBeenCalledWith(
      TEST_USER.userId,
      'cookie-refresh',
    );
  });

  it('forwards email verify and password reset bodies', async () => {
    const verifyDto = { token: 'verify-token-1' };
    const resetRequest = { email: 'test@example.com' };
    const resetDto = { token: 'reset-token-1', newPassword: 'newpass1' };
    mockService.verifyEmail.mockResolvedValue({ ok: true });
    mockService.requestPasswordReset.mockResolvedValue({ ok: true });
    mockService.resetPassword.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send(verifyDto)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/request-reset')
      .send(resetRequest)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send(resetDto)
      .expect(200);

    expect(mockService.verifyEmail).toHaveBeenCalledWith(verifyDto);
    expect(mockService.requestPasswordReset).toHaveBeenCalledWith(resetRequest);
    expect(mockService.resetPassword).toHaveBeenCalledWith(resetDto);
  });

  it('resends verification and lists sessions as the caller userId', async () => {
    mockService.resendVerification.mockResolvedValue({ ok: true });
    mockService.getUserSessions.mockResolvedValue([]);

    await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set(BEARER)
      .expect(200);

    expect(mockService.resendVerification).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
    expect(mockService.getUserSessions).toHaveBeenCalledWith(TEST_USER.userId);
  });

  it('revokes other sessions and one session as the caller userId', async () => {
    mockService.revokeOtherSessions.mockResolvedValue({ ok: true });
    mockService.revokeSession.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions/other')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions/session-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.revokeOtherSessions).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
    expect(mockService.revokeSession).toHaveBeenCalledWith(
      TEST_USER.userId,
      'session-1',
    );
  });
});
