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
    profile: {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    signIn: { findFirst: ReturnType<typeof vi.fn> };
  };
  let mockConfigService: {
    getOrThrow: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockPrisma = {
      user: { findUnique: vi.fn() },
      profile: { findFirst: vi.fn(), findMany: vi.fn() },
      // The sign-in of the session, with the email it signs in with.
      signIn: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 'sign-in-1', email: 'test@example.com' }),
      },
    };
    // The strategy reads the account's Profiles; tests configure them
    // through findFirst (one call per Profile).
    mockPrisma.profile.findMany.mockImplementation(async () => {
      const profile = await (
        mockPrisma.profile.findFirst as () => Promise<unknown>
      )();
      return profile ? [profile] : [];
    });

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
          details: {
            reason: 'Abusive spam behavior',
          },
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
          details: {
            reason: 'Profile violated community terms',
          },
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
          details: {
            suspendedUntil: futureDate.toISOString(),
          },
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
        signInId: 'sign-in-1',
        isTestAccount: false,
      });
    });

    describe('the sign-in of the session', () => {
      const account = {
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
        email: 'account@example.com',
      };
      beforeEach(() => {
        mockPrisma.user.findUnique.mockResolvedValue(account);
        mockPrisma.profile.findFirst.mockResolvedValue({
          id: 'prof-1',
          suspendedUntil: null,
        });
      });

      it('is the one the token names, looked for inside the account, and gives the session its email', async () => {
        mockPrisma.signIn.findFirst.mockResolvedValue({
          id: 'sign-in-own',
          email: 'own@example.com',
        });

        const result = await strategy.validate({
          ...payload,
          signInId: 'sign-in-own',
        });

        expect(mockPrisma.signIn.findFirst).toHaveBeenCalledWith({
          where: { userId: 'u-1', id: 'sign-in-own' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, email: true },
        });
        expect(result.signInId).toBe('sign-in-own');
        expect(result.email).toBe('own@example.com');
      });

      it('is the first of the account for a token issued before sessions carried it', async () => {
        const result = await strategy.validate(payload);

        expect(mockPrisma.signIn.findFirst.mock.calls[0][0].where).toEqual({
          userId: 'u-1',
        });
        expect(result.signInId).toBe('sign-in-1');
      });

      it('refuses a token whose sign-in is of another account or is gone', async () => {
        mockPrisma.signIn.findFirst.mockResolvedValue(null);

        await expect(
          strategy.validate({ ...payload, signInId: 'sign-in-of-another' }),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    it('reports a Test Account from the database row, not from the token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        isRootBanned: false,
        email: 'test@example.com',
        role: 'USER',
        isTestAccount: true,
      });
      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'prof-1',
        suspendedUntil: null,
      });

      const result = await strategy.validate({
        ...payload,
        isTestAccount: false,
      } as never);

      expect(result.isTestAccount).toBe(true);
    });

    const activeUser = {
      id: 'u-1',
      isActive: true,
      isRootBanned: false,
      email: 'test@example.com',
      role: 'USER',
    };
    const profileRow = (id: string, isAccountBanned = false) => ({
      id,
      isAccountBanned,
      accountBanReason: isAccountBanned ? 'Banned after a report review' : null,
      suspendedUntil: null,
    });

    it('acts as the Profile bound to the session', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      mockPrisma.profile.findMany.mockResolvedValue([
        profileRow('prof-1'),
        profileRow('prof-2'),
      ]);

      const result = await strategy.validate({
        sub: 'u-1',
        email: 'test@example.com',
        profileId: 'prof-2',
      });

      expect(mockPrisma.profile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-1' } }),
      );
      expect(result.profileId).toBe('prof-2');
    });

    it('rejects a session bound to a banned Profile instead of switching Profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      mockPrisma.profile.findMany.mockResolvedValue([
        profileRow('prof-1'),
        profileRow('prof-2', true),
      ]);

      await expect(
        strategy.validate({
          sub: 'u-1',
          email: 'test@example.com',
          profileId: 'prof-2',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('without a bound Profile, uses the oldest Profile that is not banned', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(activeUser);
      mockPrisma.profile.findMany.mockResolvedValue([
        profileRow('prof-1', true),
        profileRow('prof-2'),
      ]);

      const result = await strategy.validate({
        sub: 'u-1',
        email: 'test@example.com',
      });

      expect(result.profileId).toBe('prof-2');
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
        signInId: 'sign-in-1',
        isTestAccount: false,
      });
    });
  });
});
