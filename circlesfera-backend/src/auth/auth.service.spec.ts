import { ApiErrorCode } from '@circlesfera/shared';
import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceSignalService } from '../common/abuse/device-signal.service.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { CryptoService } from '../common/services/crypto.service.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { AuthService } from './auth.service.js';

vi.mock('otplib', () => ({
  verifySync: vi.fn(({ token, secret }: { token: string; secret: string }) => ({
    valid: token === '123456' && secret === 'totp-base32-secret',
  })),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    profile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockJwtService = {
    sign: vi.fn(() => 'mock-token'),
    verify: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string): string | null => {
      if (key === 'JWT_SECRET') return 'secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      return null;
    }),
    getOrThrow: vi.fn((key: string): string => {
      if (key === 'JWT_SECRET') return 'secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      throw new Error(`Missing key ${key}`);
    }),
  };

  const mockEmailService = {
    sendVerificationEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };

  const mockUsersQueue = {
    add: vi.fn(),
    getJob: vi.fn(),
  };

  const mockSystemSettings = {
    isEnabled: vi.fn(async (key: string) => {
      if (key === 'registration_open') return true;
      if (key === 'require_invite_code') return false;
      return false;
    }),
  };

  const mockCryptoService = {
    encrypt: vi.fn((val: string) => `enc:${val}`),
    decrypt: vi.fn((val: string) =>
      val.startsWith('enc:') ? val.slice(4) : val,
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: getQueueToken('users-processing'),
          useValue: mockUsersQueue,
        },
        { provide: SystemSettingsService, useValue: mockSystemSettings },
        {
          provide: TurnstileService,
          useValue: {
            assertValid: vi.fn().mockResolvedValue(undefined),
            incrementEmailForbidden: vi.fn(),
          },
        },
        {
          provide: DeviceSignalService,
          useValue: {
            recordSignup: vi.fn().mockResolvedValue(undefined),
            recordLogin: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
        },
        {
          provide: CryptoService,
          useValue: mockCryptoService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    vi.clearAllMocks();
    mockSystemSettings.isEnabled.mockImplementation(async (key: string) => {
      if (key === 'registration_open') return true;
      if (key === 'require_invite_code') return false;
      return false;
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const dto = {
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
      fullName: 'Test User',
      dateOfBirth: '1990-01-15',
    };

    it('should hash password with argon2 and create user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: '1',
        email: dto.email,
      });

      const result = await service.register(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalled();
      const createArgs = mockPrismaService.user.create.mock.calls[0][0] as {
        data: { password: string };
      };
      expect(createArgs.data.password).toContain('$argon2');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw BadRequestException if under 16', async () => {
      const underage = {
        ...dto,
        dateOfBirth: new Date().toISOString().slice(0, 10),
      };
      await expect(service.register(underage)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when registration is closed', async () => {
      mockSystemSettings.isEnabled.mockImplementation(async (key: string) => {
        if (key === 'registration_open') return false;
        return false;
      });
      await expect(service.register(dto)).rejects.toThrow(BadRequestException);
    });

    it('should require invite code when setting is enabled', async () => {
      mockSystemSettings.isEnabled.mockImplementation(async (key: string) => {
        if (key === 'registration_open') return true;
        if (key === 'require_invite_code') return true;
        return false;
      });
      await expect(service.register(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if email exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: '1' });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    const dto = {
      identifier: 'test@example.com',
      password: 'password123',
    };

    it('should login successfully with argon2 hash', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
      });

      const result = await service.login(dto);
      expect(result).toHaveProperty('accessToken');
    });

    it('should fallback to bcrypt and migrate to argon2', async () => {
      const bcryptHash = await bcrypt.hash(dto.password, 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.identifier,
        password: bcryptHash,
        isActive: true,
      });

      const result = await service.login(dto);

      expect(mockPrismaService.user.update).toHaveBeenCalled();
      const updateArgs = mockPrismaService.user.update.mock.calls[0][0] as {
        data: { password: string };
      };
      expect(updateArgs.data.password).toContain('$argon2');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const argonHash = await argon2.hash('wrongpassword');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for deactivated account', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: dto.identifier,
        password: argonHash,
        isActive: false,
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should strictly reject plaintext passwords and fail closed without updating user', async () => {
      // Stored password matches dto.password in plaintext
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-plaintext',
        email: dto.identifier,
        password: dto.password,
        isActive: true,
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should fail closed on unknown or malformed password hash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-malformed',
        email: dto.identifier,
        password: 'corrupted_hash_format_xyz',
        isActive: true,
      });

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should fail closed when JWT_SECRET is missing during appeal token generation', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'banned-user',
        email: dto.identifier,
        password: argonHash,
        isActive: false,
        deletedAt: null,
        isRootBanned: false,
      });

      mockConfigService.getOrThrow.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') {
          throw new Error('Missing key JWT_SECRET');
        }
        return 'dummy';
      });

      await expect(service.login(dto)).rejects.toThrow(
        'Missing key JWT_SECRET',
      );
    });

    it('should generate appeal token with configured JWT_SECRET without hardcoded fallback', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'banned-user',
        email: dto.identifier,
        password: argonHash,
        isActive: false,
        deletedAt: null,
        isRootBanned: false,
      });

      mockConfigService.getOrThrow.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'configured-production-secret';
        return 'dummy';
      });

      try {
        await service.login(dto);
        expect.unreachable('Should have thrown UnauthorizedException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect(mockJwtService.sign).toHaveBeenCalledWith(
          { sub: 'banned-user', isAppealToken: true },
          { expiresIn: '15m', secret: 'configured-production-secret' },
        );
      }
    });

    it('should require 2FA code when user has 2FA enabled', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '2fa-user',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
        isTwoFactorEnabled: true,
        twoFactorSecret: 'enc:totp-base32-secret',
      });

      await expect(service.login(dto)).rejects.toThrow('2FA_REQUIRED');
    });

    it('should decrypt secret and login successfully when 2FA code is valid', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '2fa-user',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
        isTwoFactorEnabled: true,
        twoFactorSecret: 'enc:totp-base32-secret',
      });

      const result = await service.login({
        ...dto,
        twoFactorCode: '123456',
      });

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(
        'enc:totp-base32-secret',
      );
      expect(result).toHaveProperty('accessToken');
    });

    it('should opportunistically migrate legacy plaintext 2FA secret on successful login', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '2fa-legacy-user',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
        isTwoFactorEnabled: true,
        twoFactorSecret: 'totp-base32-secret', // no colon, plaintext legacy
      });

      const result = await service.login({
        ...dto,
        twoFactorCode: '123456',
      });

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(
        'totp-base32-secret',
      );
      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(
        'totp-base32-secret',
      );
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: '2fa-legacy-user' },
        data: { twoFactorSecret: 'enc:totp-base32-secret' },
      });
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException when 2FA code is invalid', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '2fa-user',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
        isTwoFactorEnabled: true,
        twoFactorSecret: 'enc:totp-base32-secret',
      });

      await expect(
        service.login({
          ...dto,
          twoFactorCode: '999999',
        }),
      ).rejects.toThrow('Invalid 2FA code');
    });

    it('should fail securely when argon2.verify throws an exception', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-err',
        email: dto.identifier,
        password: '$argon2id$bad',
        isActive: true,
      });

      await expect(service.login(dto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('should throw ACCOUNT_BANNED when inactive user is root banned on login', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'banned-inactive-user',
        email: dto.identifier,
        password: argonHash,
        isActive: false,
        isRootBanned: true,
        rootBanReason: 'Major violation',
      });

      await expect(service.login(dto)).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Major violation',
        }),
      );
    });

    it('should handle rolling migration update error gracefully when legacy 2FA update rejects', async () => {
      const argonHash = await argon2.hash(dto.password);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '2fa-legacy-user-catch',
        email: dto.identifier,
        password: argonHash,
        isActive: true,
        isTwoFactorEnabled: true,
        twoFactorSecret: 'totp-base32-secret',
      });
      mockPrismaService.user.update.mockRejectedValueOnce(
        new Error('DB write collision'),
      );

      const result = await service.login({
        ...dto,
        twoFactorCode: '123456',
      });

      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully and evict profile cache', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: '1' });
      mockPrismaService.profile.findFirst.mockResolvedValue({
        username: 'bob',
      });
      const result = await service.verifyEmail({ token: 'token' });
      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(result.message).toContain('successfully');
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail({ token: 'invalid' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('should generate reset token and send email', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
      });
      const result = await service.requestPasswordReset({
        email: 'test@example.com',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(result.message).toContain('email has been sent');
    });
  });

  describe('resetPassword', () => {
    it('should reset password with argon2 hash', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: '1',
        resetTokenExpires: new Date(Date.now() + 100000),
      });
      const result = await service.resetPassword({
        token: 'token',
        newPassword: 'newPassword123',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(result.message).toContain('successfully');

      const updateArgs = mockPrismaService.user.update.mock.calls[
        mockPrismaService.user.update.mock.calls.length - 1
      ][0] as { data: { password: string } };
      expect(updateArgs.data.password).toContain('$argon2');
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens successfully and mark old token as revoked', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: '1',
        email: 'test@example.com',
        familyId: 'family-1',
      });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 'token-id',
        userId: '1',
        familyId: 'family-1',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000),
      });

      const result = await service.refreshToken({
        refreshToken: 'mock-refresh',
      });
      expect(result).toHaveProperty('accessToken');
      expect(mockPrismaService.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-id' },
          data: expect.objectContaining({ isRevoked: true }),
        }),
      );
    });

    it('should detect token replay, revoke entire family and throw UnauthorizedException', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: '1',
        email: 'test@example.com',
        familyId: 'family-compromised',
      });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 'old-token-id',
        userId: '1',
        familyId: 'family-compromised',
        isRevoked: true,
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.refreshToken({
          refreshToken: 'mock-reused-token',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: '1',
          familyId: 'family-compromised',
        },
      });
    });

    it('should throw UnauthorizedException if token is expired', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: '1',
        email: 'test@example.com',
      });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        id: 'token-id',
        userId: '1',
        familyId: 'family-1',
        isRevoked: false,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.refreshToken({
          refreshToken: 'mock-refresh',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('generateTokens', () => {
    it('should store cryptographic sha256 digest of refresh token at rest, not raw token', async () => {
      mockPrismaService.refreshToken.create.mockClear();

      const result = await service.generateTokens('user-1', 'user@example.com');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');

      expect(mockPrismaService.refreshToken.create).toHaveBeenCalled();
      const createCall = mockPrismaService.refreshToken.create.mock.calls[0][0];
      const storedToken = createCall.data.token;

      // Must be a 64-character hex string (SHA-256 digest)
      expect(storedToken).toMatch(/^[a-f0-9]{64}$/);
      // Must not match the raw token returned to client
      expect(storedToken).not.toBe(result.refreshToken);
      // Family ID must be set
      expect(createCall.data.familyId).toBeDefined();
      expect(createCall.data.isRevoked).toBe(false);
    });
  });

  describe('logout', () => {
    it('should delete refresh tokens by family or hash', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-1',
        userId: '1',
        familyId: 'family-logout',
      });

      await service.logout('1', 'token');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: '1',
          familyId: 'family-logout',
        },
      });
    });
  });

  describe('session management', () => {
    it('should fetch only non-revoked active user sessions', async () => {
      mockPrismaService.refreshToken.findMany = vi
        .fn()
        .mockResolvedValue([
          { id: 's1', userAgent: 'Chrome', ipAddress: '127.0.0.1' },
        ]);
      const sessions = await service.getUserSessions('user-1');
      expect(sessions).toHaveLength(1);
      expect(mockPrismaService.refreshToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            isRevoked: false,
          }),
        }),
      );
    });

    it('should revoke a single session and its family', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 's1',
        userId: 'user-1',
        familyId: 'family-session-1',
      });

      await service.revokeSession('user-1', 's1');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { familyId: 'family-session-1', userId: 'user-1' },
      });
    });

    it('should revoke session without familyId directly by id and userId', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 's2',
        userId: 'user-1',
        familyId: null,
      });

      await service.revokeSession('user-1', 's2');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { id: 's2', userId: 'user-1' },
      });
    });

    it('should revoke other sessions', async () => {
      await service.revokeOtherSessions('user-1', 's1');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', id: { not: 's1' } },
      });
    });

    it('should revoke all other sessions when currentSessionId is omitted', async () => {
      await service.revokeOtherSessions('user-1');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('resendVerification', () => {
    it('throws BadRequestException when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.resendVerification('u-404')).rejects.toThrow(
        new BadRequestException('User not found'),
      );
    });

    it('returns message when email is already verified', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        email: 'v@example.com',
        emailVerified: new Date(),
      });
      const result = await service.resendVerification('u-verified');
      expect(result).toEqual({ message: 'Email already verified' });
      expect(mockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('updates token and sends email when user is unverified', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        email: 'unv@example.com',
        emailVerified: null,
      });
      const result = await service.resendVerification('u-unverified');
      expect(result).toEqual({ message: 'Verification email sent' });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-unverified' },
          data: expect.objectContaining({
            verificationToken: expect.any(String),
          }),
        }),
      );
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalled();
    });
  });

  describe('loginById', () => {
    it('throws UnauthorizedException when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.loginById('u-missing')).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });

    it('auto-restores user if inactive during scheduled deletion grace period', async () => {
      const futureDate = new Date(Date.now() + 100000);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-restored',
        email: 'restored@example.com',
        isActive: false,
        scheduledDeletionAt: futureDate,
      });
      const mockJob = { remove: vi.fn() };
      mockUsersQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.loginById('u-restored');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-restored' },
        data: {
          isActive: true,
          deletedAt: null,
          scheduledDeletionAt: null,
        },
      });
      expect(mockJob.remove).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('throws UnauthorizedException with ACCOUNT_BANNED when inactive user is root banned', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-banned-inactive',
        isActive: false,
        isRootBanned: true,
        rootBanReason: 'Fraud violation',
      });

      await expect(service.loginById('u-banned-inactive')).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Fraud violation',
        }),
      );
    });

    it('throws UnauthorizedException with appealToken when inactive user is not root banned', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-deactivated',
        isActive: false,
        isRootBanned: false,
      });

      await expect(service.loginById('u-deactivated')).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            message: ApiErrorCode.ACCOUNT_BANNED,
            appealToken: expect.any(String),
          }),
        }),
      );
    });

    it('throws UnauthorizedException with ACCOUNT_BANNED when active user is root banned', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-banned-active',
        isActive: true,
        isRootBanned: true,
        rootBanReason: 'Spam violation',
      });

      await expect(service.loginById('u-banned-active')).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Spam violation',
        }),
      );
    });

    it('returns tokens when user is active and in good standing', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-good',
        email: 'good@example.com',
        isActive: true,
        isRootBanned: false,
      });

      const result = await service.loginById('u-good');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  describe('register edge cases', () => {
    it('throws BadRequestException for invalid date of birth', async () => {
      await expect(
        service.register({
          email: 'valid@example.com',
          username: 'validuser',
          password: 'Password123!',
          dateOfBirth: 'not-a-valid-date',
        }),
      ).rejects.toThrow(new BadRequestException('Invalid date of birth'));
    });

    it('throws ConflictException when username is already taken', async () => {
      const validDob = new Date();
      validDob.setFullYear(validDob.getFullYear() - 20);

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'prof-existing',
      });

      await expect(
        service.register({
          email: 'new@example.com',
          username: 'takenusername',
          password: 'Password123!',
          dateOfBirth: validDob.toISOString(),
        }),
      ).rejects.toThrow(new ConflictException('Username already taken'));
    });

    it('validates invite code when provided: rejects invalid invite code', async () => {
      const validDob = new Date();
      validDob.setFullYear(validDob.getFullYear() - 20);

      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.register({
          email: 'invited@example.com',
          username: 'inviteduser',
          password: 'Password123!',
          dateOfBirth: validDob.toISOString(),
          inviteCode: 'INVALID-CODE',
        }),
      ).rejects.toThrow(new BadRequestException('Invalid invite code'));
    });

    it('validates invite code: rejects when limit of 3 referrals reached', async () => {
      const validDob = new Date();
      validDob.setFullYear(validDob.getFullYear() - 20);

      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'referring-user-id',
        _count: { referrals: 3 },
      });

      await expect(
        service.register({
          email: 'invited@example.com',
          username: 'inviteduser',
          password: 'Password123!',
          dateOfBirth: validDob.toISOString(),
          inviteCode: 'MAXED-CODE',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'This invite code has reached its maximum usage limit',
        ),
      );
    });

    it('accepts valid invite code and sets referredById', async () => {
      const validDob = new Date();
      validDob.setFullYear(validDob.getFullYear() - 20);

      mockPrismaService.user.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: 'referrer-1',
        _count: { referrals: 1 },
      });
      mockPrismaService.user.create.mockResolvedValue({
        id: 'new-user',
        email: 'invited@example.com',
      });

      const result = await service.register({
        email: 'invited@example.com',
        username: 'inviteduser',
        password: 'Password123!',
        dateOfBirth: validDob.toISOString(),
        inviteCode: 'VALID-CODE',
      });

      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ referredById: 'referrer-1' }),
        }),
      );
      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('login edge cases', () => {
    it('logs in with username when identifier does not match email', async () => {
      const hashedPassword = await argon2.hash('MySecretPassword!');
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue({
        user: {
          id: 'u-by-username',
          email: 'user@example.com',
          password: hashedPassword,
          isActive: true,
          isRootBanned: false,
          isTwoFactorEnabled: false,
        },
      });

      const result = await service.login({
        identifier: 'my_cool_handle',
        password: 'MySecretPassword!',
      });
      expect(result).toHaveProperty('accessToken');
    });

    it('throws UnauthorizedException when identifier matches neither email nor username', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue(null);

      await expect(
        service.login({
          identifier: 'ghost_user',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid email, username or password'),
      );
    });

    it('throws UnauthorizedException with ACCOUNT_SUSPENDED when profile is suspended', async () => {
      const hashedPassword = await argon2.hash('Password123!');
      const futureDate = new Date(Date.now() + 86400000);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-suspended',
        email: 'suspended@example.com',
        password: hashedPassword,
        isActive: true,
        isRootBanned: false,
      });
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'prof-suspended',
        suspendedUntil: futureDate,
      });

      await expect(
        service.login({
          identifier: 'suspended@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            message: ApiErrorCode.ACCOUNT_SUSPENDED,
            suspendedUntil: futureDate.toISOString(),
          }),
        }),
      );
    });

    it('auto-restores inactive user during GDPR grace period on login', async () => {
      const hashedPassword = await argon2.hash('Password123!');
      const futureDate = new Date(Date.now() + 86400000);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-gdpr',
        email: 'gdpr@example.com',
        password: hashedPassword,
        isActive: false,
        scheduledDeletionAt: futureDate,
      });
      mockPrismaService.profile.findFirst.mockResolvedValue(null);
      const mockJob = { remove: vi.fn() };
      mockUsersQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.login({
        identifier: 'gdpr@example.com',
        password: 'Password123!',
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-gdpr' },
        data: {
          isActive: true,
          deletedAt: null,
          scheduledDeletionAt: null,
        },
      });
      expect(mockJob.remove).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
    });

    it('throws UnauthorizedException with ACCOUNT_BANNED when active user is root banned', async () => {
      const hashedPassword = await argon2.hash('Password123!');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-banned',
        email: 'banned@example.com',
        password: hashedPassword,
        isActive: true,
        isRootBanned: true,
        rootBanReason: 'TOS violation',
      });
      mockPrismaService.profile.findFirst.mockResolvedValue(null);

      await expect(
        service.login({
          identifier: 'banned@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'TOS violation',
        }),
      );
    });

    it('throws UnauthorizedException when 2FA is enabled but twoFactorSecret is missing', async () => {
      const hashedPassword = await argon2.hash('Password123!');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-2fa-misconfigured',
        email: '2fa@example.com',
        password: hashedPassword,
        isActive: true,
        isRootBanned: false,
        isTwoFactorEnabled: true,
        twoFactorSecret: null,
      });
      mockPrismaService.profile.findFirst.mockResolvedValue(null);

      await expect(
        service.login({
          identifier: '2fa@example.com',
          password: 'Password123!',
          twoFactorCode: '123456',
        }),
      ).rejects.toThrow(new UnauthorizedException('2FA configuration error'));
    });

    it('throws UnauthorizedException when verifySync throws unexpected error during 2FA', async () => {
      const hashedPassword = await argon2.hash('Password123!');
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-2fa-error',
        email: '2fa-err@example.com',
        password: hashedPassword,
        isActive: true,
        isRootBanned: false,
        isTwoFactorEnabled: true,
        twoFactorSecret: 'enc:secret',
      });
      mockPrismaService.profile.findFirst.mockResolvedValue(null);

      const { verifySync } = await import('otplib');
      (verifySync as any).mockImplementationOnce(() => {
        throw new Error('OTPLIB unexpected failure');
      });

      await expect(
        service.login({
          identifier: '2fa-err@example.com',
          password: 'Password123!',
          twoFactorCode: '123456',
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Invalid 2FA code or configuration'),
      );
    });
  });

  describe('refreshToken edge cases', () => {
    it('throws UnauthorizedException when refreshToken is missing', async () => {
      await expect(service.refreshToken({ refreshToken: '' })).rejects.toThrow(
        new UnauthorizedException('Refresh token required'),
      );
    });

    it('throws UnauthorizedException when jwtService.verify throws', async () => {
      mockJwtService.verify.mockImplementationOnce(() => {
        throw new Error('JWT expired or malformed');
      });

      await expect(
        service.refreshToken({ refreshToken: 'bad-token' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
    });

    it('throws UnauthorizedException when token record is not in database', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: 'u-1',
        email: 'u@example.com',
      });
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refreshToken({ refreshToken: 'valid-jwt-but-not-in-db' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
    });

    it('throws UnauthorizedException when token userId does not match payload sub', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: 'u-1',
        email: 'u@example.com',
      });
      mockPrismaService.refreshToken.findUnique.mockResolvedValueOnce({
        userId: 'u-different',
        token: 'hashed-token',
      });

      await expect(
        service.refreshToken({ refreshToken: 'mismatched-user-token' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid refresh token'));
    });

    it('deletes single record when revoked token has no familyId and throws', async () => {
      mockJwtService.verify.mockReturnValueOnce({
        sub: 'u-1',
        email: 'u@example.com',
      });
      mockPrismaService.refreshToken.findUnique.mockResolvedValueOnce({
        id: 'tok-revoked-no-fam',
        userId: 'u-1',
        isRevoked: true,
        familyId: null,
      });

      await expect(
        service.refreshToken({ refreshToken: 'revoked-token' }),
      ).rejects.toThrow(
        new UnauthorizedException('Refresh token reuse detected'),
      );

      expect(mockPrismaService.refreshToken.delete).toHaveBeenCalledWith({
        where: { id: 'tok-revoked-no-fam' },
      });
    });
  });

  describe('logout edge cases', () => {
    it('deletes refresh token directly when stored token has no familyId', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({
        id: 'token-no-family',
        userId: 'user-1',
        familyId: null,
      });

      await service.logout('user-1', 'raw-token');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });
  });

  describe('password reset edge cases', () => {
    it('returns silent success when requesting reset for non-existent user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      const result = await service.requestPasswordReset({
        email: 'nonexistent@example.com',
      });
      expect(result).toEqual({
        message: 'If an account exists, a reset email has been sent',
      });
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when resetting password with invalid token', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword({
          token: 'invalid-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired reset token'),
      );
    });

    it('throws BadRequestException when resetting password with expired token', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-expired-token',
        resetTokenExpires: new Date(Date.now() - 100000),
      });
      await expect(
        service.resetPassword({
          token: 'expired-token',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired reset token'),
      );
    });
  });

  describe('generateTokens legacy DB column fallback', () => {
    it('falls back to minimal columns if primary insert throws', async () => {
      mockPrismaService.refreshToken.create
        .mockRejectedValueOnce(new Error('Column familyId does not exist'))
        .mockResolvedValueOnce({ id: 'fallback-tok' });

      const result = await service.generateTokens('u-1', 'u@example.com');
      expect(result).toHaveProperty('accessToken');
      expect(mockPrismaService.refreshToken.create).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.refreshToken.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          userId: 'u-1',
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
    });
  });
});
