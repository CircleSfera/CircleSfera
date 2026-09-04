import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
  adminAccessTokenCookieOptions,
  adminRefreshTokenCookieOptions,
  clearCookieOptions,
} from '../common/config/cookie.config.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';

describe('AdminAuthController', () => {
  let controller: AdminAuthController;

  const admin: CurrentAdminData = {
    adminId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Staff',
    permissions: ['users.read'],
    roles: ['ADMIN'],
    userId: 'admin-1',
  };

  const tokens = {
    accessToken: 'admin-access-test',
    refreshToken: 'admin-refresh-test',
  };

  const req = {
    ip: '203.0.113.10',
    headers: { 'user-agent': 'Vitest' },
    cookies: {},
  } as unknown as Request;

  const expectedMeta = {
    ip: '203.0.113.10',
    userAgent: 'Vitest',
  };

  const mockRes = () =>
    ({
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    }) as unknown as Response;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuthController],
      providers: [{ provide: AdminAuthService, useValue: mockService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminAuthController>(AdminAuthController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('logs in, sets admin cookies, and returns OK', async () => {
    const res = mockRes();
    mockService.login.mockResolvedValue({ status: 'OK', tokens });

    const result = await controller.login(
      { email: 'admin@example.com', password: 'password1' },
      req,
      res,
    );

    expect(mockService.login).toHaveBeenCalledWith(
      'admin@example.com',
      'password1',
      expectedMeta,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      ADMIN_ACCESS_TOKEN_COOKIE,
      'admin-access-test',
      adminAccessTokenCookieOptions,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      ADMIN_REFRESH_TOKEN_COOKIE,
      'admin-refresh-test',
      adminRefreshTokenCookieOptions,
    );
    expect(result).toEqual({ message: 'Login successful', status: 'OK' });
  });

  it('returns MFA required without setting cookies', async () => {
    const res = mockRes();
    mockService.login.mockResolvedValue({
      status: 'MFA_REQUIRED',
      mfaToken: 'mfa-token-1',
    });

    const result = await controller.login(
      { email: 'admin@example.com', password: 'password1' },
      req,
      res,
    );

    expect(res.cookie).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'MFA_REQUIRED',
      mfaToken: 'mfa-token-1',
    });
  });

  it('forwards MFA setup fields without setting cookies', async () => {
    const res = mockRes();
    mockService.login.mockResolvedValue({
      status: 'MFA_SETUP_REQUIRED',
      mfaToken: 'mfa-token-1',
      otpauthUrl: 'otpauth://test',
      secret: 'setup-secret-test',
      qrCodeDataUrl: 'data:image/png;base64,test',
    });

    const result = await controller.login(
      { email: 'admin@example.com', password: 'password1' },
      req,
      res,
    );

    expect(res.cookie).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'MFA_SETUP_REQUIRED',
      mfaToken: 'mfa-token-1',
      otpauthUrl: 'otpauth://test',
      secret: 'setup-secret-test',
      qrCodeDataUrl: 'data:image/png;base64,test',
    });
  });

  it('verifies MFA and sets admin cookies', async () => {
    const res = mockRes();
    mockService.verifyMfa.mockResolvedValue(tokens);

    const result = await controller.verifyMfa(
      { mfaToken: 'mfa-token-1', code: '123456' },
      req,
      res,
    );

    expect(mockService.verifyMfa).toHaveBeenCalledWith(
      'mfa-token-1',
      '123456',
      expectedMeta,
    );
    expect(result).toEqual({ message: 'Login successful', status: 'OK' });
  });

  it('refreshes from the admin refresh cookie', async () => {
    const res = mockRes();
    mockService.refresh.mockResolvedValue(tokens);
    const refreshReq = {
      ...req,
      cookies: { [ADMIN_REFRESH_TOKEN_COOKIE]: 'admin-refresh-cookie' },
    } as unknown as Request;

    const result = await controller.refresh(refreshReq, res);

    expect(mockService.refresh).toHaveBeenCalledWith(
      'admin-refresh-cookie',
      expectedMeta,
    );
    expect(result).toEqual({ message: 'Token refreshed' });
  });

  it('logs out as adminId, uses the refresh cookie, and clears cookies', async () => {
    const res = mockRes();
    mockService.logout.mockResolvedValue(undefined);
    const logoutReq = {
      ...req,
      cookies: { [ADMIN_REFRESH_TOKEN_COOKIE]: 'admin-refresh-cookie' },
    } as unknown as Request;

    const result = await controller.logout(admin, logoutReq, res);

    expect(mockService.logout).toHaveBeenCalledWith(
      'admin-1',
      'admin-refresh-cookie',
      expectedMeta,
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      ADMIN_ACCESS_TOKEN_COOKIE,
      clearCookieOptions,
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      ADMIN_REFRESH_TOKEN_COOKIE,
      clearCookieOptions,
    );
    expect(result).toEqual({ message: 'Logged out' });
  });

  it('reads me and sessions as adminId', async () => {
    mockService.me.mockResolvedValue({ id: 'admin-1' });
    mockService.listSessions.mockResolvedValue([]);

    await controller.me(admin);
    await controller.sessions(admin);

    expect(mockService.me).toHaveBeenCalledWith('admin-1');
    expect(mockService.listSessions).toHaveBeenCalledWith('admin-1');
  });

  it('revokes a session as adminId', async () => {
    mockService.revokeSession.mockResolvedValue(undefined);

    const result = await controller.revokeSession(admin, 'session-1');

    expect(mockService.revokeSession).toHaveBeenCalledWith(
      'admin-1',
      'session-1',
    );
    expect(result).toEqual({ message: 'Session revoked' });
  });

  it('steps up as adminId and refreshes only the access cookie', async () => {
    const res = mockRes();
    mockService.stepUp.mockResolvedValue({ accessToken: 'admin-access-step' });
    const dto = { password: 'password1' };

    const result = await controller.stepUp(admin, dto, res);

    expect(mockService.stepUp).toHaveBeenCalledWith('admin-1', dto);
    expect(res.cookie).toHaveBeenCalledWith(
      ADMIN_ACCESS_TOKEN_COOKIE,
      'admin-access-step',
      adminAccessTokenCookieOptions,
    );
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ message: 'Step-up verified' });
  });
});
