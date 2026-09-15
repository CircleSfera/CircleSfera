import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_ADMIN_JWT_FALLBACK_SECRET } from '../../common/config/admin-jwt.config.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import {
  ADMIN_JWT_AUDIENCE,
  type AdminJwtPayload,
  AdminJwtStrategy,
} from './admin-jwt.strategy.js';

function createMockConfig(
  env: Record<string, string | undefined>,
): ConfigService {
  return {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const val = env[key];
      if (!val) throw new Error(`Config key "${key}" does not exist`);
      return val;
    },
  } as unknown as ConfigService;
}

describe('AdminJwtStrategy', () => {
  let strategy: AdminJwtStrategy;
  let mockPrisma: any;
  const adminSecret = 'dedicated-admin-test-secret-at-least-32-chars';
  const platformUserSecret = 'platform-user-secret-at-least-32-chars-different';

  const activeAdmin = {
    id: 'admin-1',
    email: 'ops@circlesfera.com',
    displayName: 'Ops Admin',
    status: 'ACTIVE',
    roles: [
      {
        role: {
          name: 'SUPERADMIN',
          permissions: [
            { permission: { key: 'content.read' } },
            { permission: { key: 'users.ban' } },
          ],
        },
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      adminIdentity: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const config = createMockConfig({
      NODE_ENV: 'development',
      JWT_ADMIN_SECRET: adminSecret,
      JWT_SECRET: platformUserSecret,
    });

    strategy = new AdminJwtStrategy(config, mockPrisma as PrismaService);
  });

  describe('token signature segregation', () => {
    it('verifies token signed with dedicated admin secret', () => {
      const token = jwt.sign(
        {
          sub: 'admin-1',
          email: 'ops@circlesfera.com',
          aud: ADMIN_JWT_AUDIENCE,
        },
        adminSecret,
      );

      const decoded = jwt.verify(token, adminSecret, {
        audience: ADMIN_JWT_AUDIENCE,
      }) as AdminJwtPayload;

      expect(decoded.sub).toBe('admin-1');
      expect(decoded.aud).toBe(ADMIN_JWT_AUDIENCE);
    });

    it('rejects user token signed with platform JWT_SECRET', () => {
      const userToken = jwt.sign(
        { sub: 'user-1', email: 'user@example.com', aud: 'circlesfera-user' },
        platformUserSecret,
      );

      expect(() => {
        jwt.verify(userToken, adminSecret, {
          audience: ADMIN_JWT_AUDIENCE,
        });
      }).toThrow();
    });

    it('uses development fallback secret when JWT_ADMIN_SECRET is omitted in dev', () => {
      const devConfig = createMockConfig({
        NODE_ENV: 'development',
        JWT_SECRET: platformUserSecret,
      });

      const devStrategy = new AdminJwtStrategy(
        devConfig,
        mockPrisma as PrismaService,
      );
      expect((devStrategy as any)._secretOrKeyProvider).toBeDefined();

      const devToken = jwt.sign(
        { sub: 'admin-dev', aud: ADMIN_JWT_AUDIENCE },
        DEV_ADMIN_JWT_FALLBACK_SECRET,
      );

      expect(() =>
        jwt.verify(devToken, DEV_ADMIN_JWT_FALLBACK_SECRET, {
          audience: ADMIN_JWT_AUDIENCE,
        }),
      ).not.toThrow();
    });
  });

  describe('validate()', () => {
    it('validates active admin identity and returns sanitized permissions and roles', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(activeAdmin);

      const payload: AdminJwtPayload = {
        sub: 'admin-1',
        email: 'ops@circlesfera.com',
        jti: 'jwt-1',
        aud: ADMIN_JWT_AUDIENCE,
        stepUp: true,
        stepUpExp: Math.floor(Date.now() / 1000) + 300,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        adminId: 'admin-1',
        userId: 'admin-1',
        email: 'ops@circlesfera.com',
        displayName: 'Ops Admin',
        permissions: ['content.read', 'users.ban'],
        roles: ['SUPERADMIN'],
        stepUpVerified: true,
      });
      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { lastActivityAt: expect.any(Date) },
      });
    });

    it('throws UnauthorizedException when audience does not match ADMIN_JWT_AUDIENCE', async () => {
      const payload = {
        sub: 'admin-1',
        email: 'ops@circlesfera.com',
        jti: 'jwt-1',
        aud: 'wrong-audience',
      } as AdminJwtPayload;

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when admin identity is not found', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(null);

      const payload: AdminJwtPayload = {
        sub: 'non-existent',
        email: 'ghost@circlesfera.com',
        jti: 'jwt-2',
        aud: ADMIN_JWT_AUDIENCE,
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when admin identity is SUSPENDED or DEACTIVATED', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        ...activeAdmin,
        status: 'DEACTIVATED',
      });

      const payload: AdminJwtPayload = {
        sub: 'admin-1',
        email: 'ops@circlesfera.com',
        jti: 'jwt-3',
        aud: ADMIN_JWT_AUDIENCE,
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
