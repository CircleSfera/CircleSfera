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
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: '1' });
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

    it('should revoke other sessions', async () => {
      await service.revokeOtherSessions('user-1', 's1');
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', id: { not: 's1' } },
      });
    });
  });
});
