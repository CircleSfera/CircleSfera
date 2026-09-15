import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_ADMIN_JWT_FALLBACK_SECRET } from '../common/config/admin-jwt.config.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminAuthService } from './admin-auth.service.js';

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

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let mockPrisma: any;
  let jwtService: JwtService;
  const adminSecret = 'test-admin-dedicated-jwt-secret-min-32-chars';
  const platformSecret = 'test-user-platform-jwt-secret-min-32-chars';

  beforeEach(() => {
    mockPrisma = {
      adminIdentity: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      adminSession: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      adminAuditLog: {
        create: vi.fn(),
      },
    };

    const config = createMockConfig({
      NODE_ENV: 'development',
      JWT_ADMIN_SECRET: adminSecret,
      JWT_SECRET: platformSecret,
    });

    jwtService = new JwtService();
    service = new AdminAuthService(
      mockPrisma as PrismaService,
      jwtService,
      config,
    );
  });

  describe('adminSecret resolution', () => {
    it('signs tokens with the dedicated admin secret', () => {
      const secret = (service as any).adminSecret();
      expect(secret).toBe(adminSecret);

      const token = jwtService.sign(
        { sub: 'admin-1', aud: 'circlesfera-admin' },
        { secret },
      );

      const verified = jwt.verify(token, adminSecret);
      expect(verified).toMatchObject({
        sub: 'admin-1',
        aud: 'circlesfera-admin',
      });
    });

    it('fails fast when instantiated in production without JWT_ADMIN_SECRET', () => {
      const prodConfig = createMockConfig({
        NODE_ENV: 'production',
        JWT_SECRET: platformSecret,
      });

      const prodService = new AdminAuthService(
        mockPrisma as PrismaService,
        jwtService,
        prodConfig,
      );

      expect(() => (prodService as any).adminSecret()).toThrow(
        /Missing JWT_ADMIN_SECRET.*strictly required in production/,
      );
    });

    it('uses deterministic fallback in development when JWT_ADMIN_SECRET is not set', () => {
      const devConfig = createMockConfig({
        NODE_ENV: 'development',
        JWT_SECRET: platformSecret,
      });

      const devService = new AdminAuthService(
        mockPrisma as PrismaService,
        jwtService,
        devConfig,
      );

      expect((devService as any).adminSecret()).toBe(
        DEV_ADMIN_JWT_FALLBACK_SECRET,
      );
    });
  });
});
