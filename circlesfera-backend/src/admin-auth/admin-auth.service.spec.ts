import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_ADMIN_JWT_FALLBACK_SECRET } from '../common/config/admin-jwt.config.js';
import type { CryptoService } from '../common/services/crypto.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminAuthService } from './admin-auth.service.js';

vi.mock('otplib', () => ({
  generateSecret: vi.fn(() => 'NEW_GENERATED_BASE32_SECRET'),
  generateURI: vi.fn(
    ({
      issuer,
      label,
      secret,
    }: {
      issuer: string;
      label: string;
      secret: string;
    }) => `otpauth://totp/${issuer}:${label}?secret=${secret}`,
  ),
  verifySync: vi.fn(({ token, secret }: { token: string; secret: string }) => ({
    valid: token === '123456' && secret === 'base32-admin-secret',
  })),
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${url}`),
}));

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

  const mockCryptoService = {
    encrypt: vi.fn((val: string) => `enc:${val}`),
    decrypt: vi.fn((val: string) =>
      val.startsWith('enc:') ? val.slice(4) : val,
    ),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      adminIdentity: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      adminSession: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      adminAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      adminRefreshToken: {
        create: vi.fn().mockResolvedValue({}),
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
      mockCryptoService as unknown as CryptoService,
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
        mockCryptoService as unknown as CryptoService,
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
        mockCryptoService as unknown as CryptoService,
      );

      expect((devService as any).adminSecret()).toBe(
        DEV_ADMIN_JWT_FALLBACK_SECRET,
      );
    });
  });

  describe('TOTP encryption at rest', () => {
    it('encrypts newly generated TOTP secret during first-time MFA enrollment', async () => {
      const passwordHash = await argon2.hash('admin-password-123');
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        passwordHash,
        status: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
        mfaRequired: true,
        totpEnabled: false,
        totpSecret: null,
        roles: [],
      });

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-password-123',
        { ip: '127.0.0.1', userAgent: 'test-agent' },
      );

      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(
        'NEW_GENERATED_BASE32_SECRET',
      );
      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { totpSecret: 'enc:NEW_GENERATED_BASE32_SECRET' },
      });
      expect(result.status).toBe('MFA_SETUP_REQUIRED');
      if (result.status === 'MFA_SETUP_REQUIRED') {
        expect(result.qrCodeDataUrl).toBeDefined();
      }
    });

    it('decrypts existing pending secret when generating enrollment QR on subsequent login', async () => {
      const passwordHash = await argon2.hash('admin-password-123');
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        passwordHash,
        status: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
        mfaRequired: true,
        totpEnabled: false,
        totpSecret: 'enc:base32-admin-secret',
        roles: [],
      });

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-password-123',
        { ip: '127.0.0.1', userAgent: 'test-agent' },
      );

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(
        'enc:base32-admin-secret',
      );
      expect(mockPrisma.adminIdentity.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totpSecret: expect.anything() }),
        }),
      );
      expect(result.status).toBe('MFA_SETUP_REQUIRED');
    });

    it('decrypts encrypted TOTP secret during verifyMfa and issues tokens', async () => {
      const mfaToken = jwtService.sign(
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          purpose: 'admin-mfa',
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
        totpEnabled: true,
        tokenVersion: 1,
        roles: [],
      });
      mockPrisma.adminSession.create.mockResolvedValue({ id: 'sess-1' });

      const result = await service.verifyMfa(mfaToken, '123456', {
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(
        'enc:base32-admin-secret',
      );
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('migrates legacy plaintext TOTP secret to encrypted form during verifyMfa', async () => {
      const mfaToken = jwtService.sign(
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          purpose: 'admin-mfa',
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        status: 'ACTIVE',
        totpSecret: 'base32-admin-secret', // plaintext without colon
        totpEnabled: true,
        tokenVersion: 1,
        roles: [],
      });
      mockPrisma.adminSession.create.mockResolvedValue({ id: 'sess-1' });

      await service.verifyMfa(mfaToken, '123456', {
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(
        'base32-admin-secret',
      );
      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(
        'base32-admin-secret',
      );
      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { totpSecret: 'enc:base32-admin-secret' },
      });
    });

    it('decrypts encrypted TOTP secret during stepUp and issues elevated access token', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
        totpEnabled: true,
        role: 'SUPER_ADMIN',
        tokenVersion: 1,
      });

      const result = await service.stepUp('admin-1', {
        totpCode: '123456',
      });

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(
        'enc:base32-admin-secret',
      );
      expect(result.accessToken).toBeDefined();
      const payload = jwt.verify(result.accessToken, adminSecret) as any;
      expect(payload.stepUp).toBe(true);
    });

    it('migrates legacy plaintext TOTP secret during stepUp', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: 'base32-admin-secret', // plaintext
        totpEnabled: true,
        role: 'SUPER_ADMIN',
        tokenVersion: 1,
      });

      await service.stepUp('admin-1', {
        totpCode: '123456',
      });

      expect(mockCryptoService.decrypt).toHaveBeenCalledWith(
        'base32-admin-secret',
      );
      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(
        'base32-admin-secret',
      );
      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { totpSecret: 'enc:base32-admin-secret' },
      });
    });
  });
});
