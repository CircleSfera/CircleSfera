import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieOptions,
} from '../../common/config/cookie.config.js';
import { AuthService } from '../auth.service.js';
import type { CurrentUserData } from '../decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { PasskeyController } from './passkey.controller.js';
import { PasskeyService } from './passkey.service.js';

describe('PasskeyController', () => {
  let controller: PasskeyController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const abuseReq = {
    ip: '203.0.113.10',
    headers: {
      'user-agent': 'Vitest',
      'x-forwarded-for': '203.0.113.10',
      'cf-ipcountry': 'ES',
    },
  } as unknown as Request;

  const expectedAbuseMeta = {
    ip: '203.0.113.10',
    userAgent: 'Vitest',
    country: 'ES',
  };

  const mockPasskey = {
    getUserPasskeys: vi.fn(),
    generateRegistrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    generateAuthenticationOptions: vi.fn(),
    verifyAuthentication: vi.fn(),
    deletePasskey: vi.fn(),
  };

  const mockAuth = {
    loginById: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PasskeyController],
      providers: [
        { provide: PasskeyService, useValue: mockPasskey },
        { provide: AuthService, useValue: mockAuth },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PasskeyController>(PasskeyController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists passkeys and registration options as the caller userId', async () => {
    mockPasskey.getUserPasskeys.mockResolvedValue([]);
    mockPasskey.generateRegistrationOptions.mockResolvedValue({
      challenge: 'c',
    });

    await controller.listPasskeys(mockUser);
    await controller.generateRegistrationOptions(mockUser);

    expect(mockPasskey.getUserPasskeys).toHaveBeenCalledWith('user-1');
    expect(mockPasskey.generateRegistrationOptions).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('verifies registration as the caller userId and unwraps the body', async () => {
    const registrationResponse = { id: 'cred-1' };
    mockPasskey.verifyRegistration.mockResolvedValue({ verified: true });

    await controller.verifyRegistration(mockUser, {
      registrationResponse: registrationResponse as never,
    });

    expect(mockPasskey.verifyRegistration).toHaveBeenCalledWith(
      'user-1',
      registrationResponse,
    );
  });

  it('generates login options from the email body', async () => {
    mockPasskey.generateAuthenticationOptions.mockResolvedValue({
      challenge: 'c',
    });

    await controller.generateAuthenticationOptions({
      email: 'test@example.com',
    });

    expect(mockPasskey.generateAuthenticationOptions).toHaveBeenCalledWith(
      'test@example.com',
    );
  });

  it('verifies login, issues cookies via loginById, and returns success', async () => {
    const res = {
      cookie: vi.fn(),
    } as unknown as Response;
    mockPasskey.verifyAuthentication.mockResolvedValue({
      verified: true,
      userId: 'user-1',
    });
    mockAuth.loginById.mockResolvedValue({
      accessToken: 'access-test',
      refreshToken: 'refresh-test',
    });

    const result = await controller.verifyAuthentication(
      abuseReq,
      {
        email: 'test@example.com',
        authenticationResponse: { id: 'cred-1' } as never,
      },
      res,
    );

    expect(mockPasskey.verifyAuthentication).toHaveBeenCalledWith(
      'test@example.com',
      { id: 'cred-1' },
    );
    expect(mockAuth.loginById).toHaveBeenCalledWith(
      'user-1',
      expectedAbuseMeta,
    );
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
    expect(result).toEqual({ message: 'Passkey login successful' });
  });

  it('rejects a failed passkey login without issuing cookies', async () => {
    const res = { cookie: vi.fn() } as unknown as Response;
    mockPasskey.verifyAuthentication.mockResolvedValue({ verified: false });

    await expect(
      controller.verifyAuthentication(
        abuseReq,
        {
          email: 'test@example.com',
          authenticationResponse: { id: 'cred-1' } as never,
        },
        res,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockAuth.loginById).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('deletes a passkey as the caller userId', async () => {
    mockPasskey.deletePasskey.mockResolvedValue({ ok: true });

    await controller.deletePasskey(mockUser, 'pk-1');

    expect(mockPasskey.deletePasskey).toHaveBeenCalledWith('user-1', 'pk-1');
  });
});
