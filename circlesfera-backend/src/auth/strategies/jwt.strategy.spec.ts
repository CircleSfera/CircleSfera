import { ApiErrorCode } from '@circlesfera/shared';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TOKEN_COOKIE } from '../../common/config/cookie.config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccountStateService } from '../services/account-state.service.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let mockPrisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    profile: { findFirst: ReturnType<typeof vi.fn> };
  };
  let mockConfigService: {
    getOrThrow: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockPrisma = {
      user: { findUnique: vi.fn() },
      profile: { findFirst: vi.fn() },
    };

    mockConfigService = {
      getOrThrow: vi
        .fn()
        .mockReturnValue('test-jwt-secret-at-least-32-chars-long'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        AccountStateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('cookieOrHeaderExtractor', () => {
    it('extracts token from cookie when present', () => {
      const extractor = (strategy as any)._jwtFromRequest;
      const req = {
        cookies: {
          [ACCESS_TOKEN_COOKIE]: 'cookie-jwt-token-123',
        },
      } as any;

      expect(extractor(req)).toBe('cookie-jwt-token-123');
    });

    it('falls back to Authorization Bearer header when cookie is missing', () => {
      const extractor = (strategy as any)._jwtFromRequest;
      const req = {
        cookies: {},
        headers: {
          authorization: 'Bearer header-jwt-token-456',
        },
      } as any;

      expect(extractor(req)).toBe('header-jwt-token-456');
    });

    it('returns null when neither cookie nor Authorization header is present', () => {
      const extractor = (strategy as any)._jwtFromRequest;
      const req = {
        headers: {},
      } as any;

      expect(extractor(req)).toBeNull();
    });
  });

  describe('validate', () => {
    const payload = { sub: 'u-1', email: 'test@example.com' };

    it('throws UnauthorizedException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException('User not found or account deactivated'),
      );
    });

    it('throws UnauthorizedException when user is inactive', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: false,
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException('User not found or account deactivated'),
      );
    });

    it('throws UnauthorizedException with ACCOUNT_BANNED when user is root banned', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        isRootBanned: true,
        rootBanReason: 'Abusive spam behavior',
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Abusive spam behavior',
        }),
      );
    });

    it('throws UnauthorizedException with ACCOUNT_BANNED when profile is banned', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
        email: 'test@example.com',
      });
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-1',
        isAccountBanned: true,
        accountBanReason: 'Profile violated community terms',
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_BANNED,
          reason: 'Profile violated community terms',
        }),
      );
    });

    it('throws UnauthorizedException with ACCOUNT_SUSPENDED when profile is suspended', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
        email: 'test@example.com',
      });
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-1',
        suspendedUntil: futureDate,
      });

      await expect(strategy.validate(payload)).rejects.toThrow(
        new UnauthorizedException({
          message: ApiErrorCode.ACCOUNT_SUSPENDED,
          suspendedUntil: futureDate.toISOString(),
        }),
      );
    });

    it('returns validated user payload when user and profile are valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
        email: 'test@example.com',
        role: 'CREATOR',
      });
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-1',
        suspendedUntil: null,
      });

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 'u-1',
        email: 'test@example.com',
        role: 'CREATOR',
        profileId: 'prof-1',
      });
    });

    it('defaults role to USER and profileId to empty string when not provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
        email: 'test@example.com',
        role: undefined,
      });
      mockPrisma.profile.findFirst.mockResolvedValue(null);

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: 'u-1',
        email: 'test@example.com',
        role: 'USER',
        profileId: '',
      });
    });
  });
});
