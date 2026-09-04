import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  clearCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from '../common/config/cookie.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import type { CurrentUserData } from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

describe('AuthController', () => {
  let controller: AuthController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const tokens = {
    accessToken: 'access-test',
    refreshToken: 'refresh-test',
  };

  const abuseReq = {
    ip: '203.0.113.10',
    headers: {
      'user-agent': 'Vitest',
      'x-forwarded-for': '203.0.113.10',
      'cf-ipcountry': 'ES',
    },
    cookies: {},
  } as unknown as Request;

  const expectedAbuseMeta = {
    ip: '203.0.113.10',
    userAgent: 'Vitest',
    country: 'ES',
  };

  const mockRes = () =>
    ({
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    }) as unknown as Response;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('registers and sets auth cookies', async () => {
    const dto = {
      email: 'new@example.com',
      password: 'password1',
      username: 'newuser',
      dateOfBirth: '2000-01-01',
    };
    const res = mockRes();
    mockService.register.mockResolvedValue(tokens);

    const result = await controller.register(dto, abuseReq, res);

    expect(mockService.register).toHaveBeenCalledWith(dto, expectedAbuseMeta);
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE,
      'access-test',
      accessTokenCookieOptions,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      'refresh-test',
      refreshTokenCookieOptions,
    );
    expect(result).toEqual({ message: 'Registration successful' });
  });

  it('logs in and sets auth cookies', async () => {
    const dto = { identifier: 'newuser', password: 'password1' };
    const res = mockRes();
    mockService.login.mockResolvedValue(tokens);

    const result = await controller.login(dto, abuseReq, res);

    expect(mockService.login).toHaveBeenCalledWith(dto, expectedAbuseMeta);
    expect(result).toEqual({ message: 'Login successful' });
  });

  it('refreshes from the refresh cookie before the body', async () => {
    const res = mockRes();
    mockService.refreshToken.mockResolvedValue(tokens);
    const req = {
      ...abuseReq,
      cookies: { [REFRESH_TOKEN_COOKIE]: 'cookie-refresh' },
    } as unknown as Request;

    const result = await controller.refresh(
      req,
      { refreshToken: 'body-refresh' },
      res,
    );

    expect(mockService.refreshToken).toHaveBeenCalledWith(
      { refreshToken: 'cookie-refresh' },
      expectedAbuseMeta,
    );
    expect(result).toEqual({ message: 'Tokens refreshed' });
  });

  it('refreshes from the body when the cookie is absent', async () => {
    const res = mockRes();
    mockService.refreshToken.mockResolvedValue(tokens);

    await controller.refresh(abuseReq, { refreshToken: 'body-refresh' }, res);

    expect(mockService.refreshToken).toHaveBeenCalledWith(
      { refreshToken: 'body-refresh' },
      expectedAbuseMeta,
    );
  });

  it('logs out the caller userId, prefers the cookie, and clears cookies', async () => {
    const res = mockRes();
    mockService.logout.mockResolvedValue(undefined);
    const req = {
      ...abuseReq,
      cookies: { [REFRESH_TOKEN_COOKIE]: 'cookie-refresh' },
    } as unknown as Request;

    await controller.logout(
      mockUser,
      req,
      { refreshToken: 'body-refresh' },
      res,
    );

    expect(mockService.logout).toHaveBeenCalledWith('user-1', 'cookie-refresh');
    expect(res.clearCookie).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE,
      clearCookieOptions,
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      clearCookieOptions,
    );
  });

  it('forwards email verify and password reset bodies', async () => {
    const verifyDto = { token: 'verify-token-1' };
    const resetRequest = { email: 'test@example.com' };
    const resetDto = { token: 'reset-token-1', newPassword: 'newpass1' };
    mockService.verifyEmail.mockResolvedValue({ ok: true });
    mockService.requestPasswordReset.mockResolvedValue({ ok: true });
    mockService.resetPassword.mockResolvedValue({ ok: true });

    await controller.verifyEmail(verifyDto);
    await controller.requestReset(resetRequest);
    await controller.resetPassword(resetDto);

    expect(mockService.verifyEmail).toHaveBeenCalledWith(verifyDto);
    expect(mockService.requestPasswordReset).toHaveBeenCalledWith(resetRequest);
    expect(mockService.resetPassword).toHaveBeenCalledWith(resetDto);
  });

  it('resends verification and lists sessions as the caller userId', async () => {
    mockService.resendVerification.mockResolvedValue({ ok: true });
    mockService.getUserSessions.mockResolvedValue([]);

    await controller.resendVerification(mockUser);
    await controller.getSessions(mockUser);

    expect(mockService.resendVerification).toHaveBeenCalledWith('user-1');
    expect(mockService.getUserSessions).toHaveBeenCalledWith('user-1');
  });

  it('revokes other sessions and one session as the caller userId', async () => {
    mockService.revokeOtherSessions.mockResolvedValue({ ok: true });
    mockService.revokeSession.mockResolvedValue({ ok: true });

    await controller.revokeOtherSessions(mockUser);
    await controller.revokeSession('session-1', mockUser);

    expect(mockService.revokeOtherSessions).toHaveBeenCalledWith('user-1');
    expect(mockService.revokeSession).toHaveBeenCalledWith(
      'user-1',
      'session-1',
    );
  });
});
