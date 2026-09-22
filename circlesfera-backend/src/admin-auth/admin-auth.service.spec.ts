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
        findUnique: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({}),
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

    it('handles legacy migration failure gracefully in verifyMfa', async () => {
      mockPrisma.adminIdentity.update.mockRejectedValueOnce(
        new Error('db lock'),
      );
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
        totpSecret: 'base32-admin-secret',
        totpEnabled: true,
        roles: [],
      });
      const res = await service.verifyMfa(mfaToken, '123456', {});
      expect(res.accessToken).toBeDefined();
    });

    it('handles legacy migration failure gracefully in stepUp', async () => {
      mockPrisma.adminIdentity.update.mockRejectedValueOnce(
        new Error('db lock'),
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: 'base32-admin-secret',
      });
      const res = await service.stepUp('admin-1', { totpCode: '123456' });
      expect(res.accessToken).toBeDefined();
    });
  });

  describe('login flows and password verification', () => {
    it('throws UnauthorizedException when admin identity does not exist', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(null);

      await expect(
        service.login('notfound@circlesfera.com', 'pwd', {}),
      ).rejects.toThrow('Invalid credentials');
    });

    it('increments failedLoginCount and locks out account on 5th failure', async () => {
      const passwordHash = await argon2.hash('correct-password');
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        passwordHash,
        status: 'ACTIVE',
        failedLoginCount: 4,
        lockedUntil: null,
      });
      mockPrisma.adminIdentity.update.mockResolvedValueOnce({
        failedLoginCount: 5,
      });

      await expect(
        service.login('admin@circlesfera.com', 'wrong-pwd', {
          ip: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      ).rejects.toThrow('Invalid credentials');

      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { failedLoginCount: { increment: 1 } },
      });
      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: {
          lockedUntil: expect.any(Date),
        },
      });
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADMIN_LOGIN_FAILED',
          adminId: 'admin-1',
        }),
      });
    });

    it('fails when admin status is not ACTIVE', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'suspended@circlesfera.com',
        status: 'SUSPENDED',
      });
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('suspended@circlesfera.com', 'pwd', {}),
      ).rejects.toThrow('Invalid credentials');
    });

    it('throws ForbiddenException when account is currently locked', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'locked@circlesfera.com',
        status: 'ACTIVE',
        lockedUntil: new Date(Date.now() + 60000),
      });

      await expect(
        service.login('locked@circlesfera.com', 'pwd', {}),
      ).rejects.toThrow('Account temporarily locked');
    });

    it('supports legacy bcrypt hashes and triggers argon2 upgrade', async () => {
      // bcrypt.compare mock or test with bcrypt.hash
      const bcrypt = await import('bcrypt');
      const realBcryptHash = await bcrypt.hash('admin-bcrypt-pass', 10);

      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        passwordHash: realBcryptHash,
        status: 'ACTIVE',
        mfaRequired: false,
        totpEnabled: false,
        roles: [],
      });

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-bcrypt-pass',
        {},
      );

      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.tokens.accessToken).toBeDefined();
        expect(result.tokens.refreshToken).toBeDefined();
      }
      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: expect.stringMatching(/^\$argon2/),
          }),
        }),
      );
    });

    it('rejects unknown password hash formats', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        passwordHash: 'plain-or-sha1-hash',
        status: 'ACTIVE',
      });
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('admin@circlesfera.com', 'password', {}),
      ).rejects.toThrow('Invalid credentials');
    });

    it('returns invalid credentials when password does not match bcrypt hash', async () => {
      const bcrypt = await import('bcrypt');
      const realBcryptHash = await bcrypt.hash('admin-bcrypt-pass', 10);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        passwordHash: realBcryptHash,
        status: 'ACTIVE',
      });
      await expect(
        service.login('admin@circlesfera.com', 'wrong-pass', {}),
      ).rejects.toThrow('Invalid credentials');
    });

    it('returns MFA_REQUIRED when admin has MFA enabled and configured', async () => {
      const passwordHash = await argon2.hash('admin-password');
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        passwordHash,
        status: 'ACTIVE',
        mfaRequired: true,
        totpEnabled: true,
        roles: [],
      });

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-password',
        {},
      );
      expect(result.status).toBe('MFA_REQUIRED');
      if (result.status === 'MFA_REQUIRED') {
        expect(result.mfaToken).toBeDefined();
      }
    });

    it('returns OK and issues tokens directly when MFA is not required', async () => {
      const passwordHash = await argon2.hash('admin-password');
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        passwordHash,
        status: 'ACTIVE',
        mfaRequired: false,
        totpEnabled: false,
        roles: [],
      });

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-password',
        {},
      );
      expect(result.status).toBe('OK');
      if (result.status === 'OK') {
        expect(result.tokens.accessToken).toBeDefined();
      }
    });
  });

  describe('verifyMfa edge cases', () => {
    it('throws when mfaToken is invalid or expired', async () => {
      await expect(
        service.verifyMfa('bad-token', '123456', {}),
      ).rejects.toThrow('Invalid or expired MFA token');
    });

    it('throws when mfaToken has invalid purpose', async () => {
      const token = jwtService.sign(
        { sub: 'admin-1', purpose: 'wrong-purpose' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      await expect(service.verifyMfa(token, '123456', {})).rejects.toThrow(
        'Invalid MFA token purpose',
      );
    });

    it('throws when admin has no totpSecret or is not active', async () => {
      const token = jwtService.sign(
        { sub: 'admin-1', purpose: 'admin-mfa' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: null,
      });

      await expect(service.verifyMfa(token, '123456', {})).rejects.toThrow(
        'MFA not configured',
      );
    });

    it('throws when TOTP code is incorrect format or invalid', async () => {
      const token = jwtService.sign(
        { sub: 'admin-1', purpose: 'admin-mfa' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
      });

      await expect(service.verifyMfa(token, '999999', {})).rejects.toThrow(
        'Invalid MFA code',
      );
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADMIN_LOGIN_FAILED',
          details: 'Invalid MFA code',
        }),
      });
    });

    it('handles verifySync throwing an exception gracefully', async () => {
      const { verifySync } = await import('otplib');
      vi.mocked(verifySync).mockImplementationOnce(() => {
        throw new Error('malformed totp secret');
      });
      const token = jwtService.sign(
        { sub: 'admin-1', purpose: 'admin-mfa' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
      });
      await expect(service.verifyMfa(token, '123456', {})).rejects.toThrow(
        'Invalid MFA code',
      );
    });

    it('rejects TOTP code that does not have exactly 6 digits', async () => {
      const token = jwtService.sign(
        { sub: 'admin-1', purpose: 'admin-mfa' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
      });
      await expect(service.verifyMfa(token, '123', {})).rejects.toThrow(
        'Invalid MFA code',
      );
    });

    it('enables totp and logs audit during first-time setup verification', async () => {
      const token = jwtService.sign(
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          purpose: 'admin-mfa-setup',
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
        totpEnabled: false,
      });

      const result = await service.verifyMfa(token, '123456', {
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { totpEnabled: true },
      });
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADMIN_MFA_ENABLED',
        }),
      });
      expect(result.accessToken).toBeDefined();
    });
  });

  describe('me endpoint and permissions aggregation', () => {
    it('throws UnauthorizedException if admin is not active', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        status: 'DEACTIVATED',
      });
      await expect(service.me('admin-1')).rejects.toThrow();
    });

    it('aggregates unique permissions across multiple roles', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'super@circlesfera.com',
        displayName: 'Super Admin',
        status: 'ACTIVE',
        totpEnabled: true,
        mfaRequired: true,
        lastLoginAt: new Date('2026-01-01'),
        roles: [
          {
            role: {
              name: 'SUPER_ADMIN',
              permissions: [
                { permission: { key: 'users:read' } },
                { permission: { key: 'users:write' } },
              ],
            },
          },
          {
            role: {
              name: 'MODERATOR',
              permissions: [
                { permission: { key: 'users:read' } },
                { permission: { key: 'posts:delete' } },
              ],
            },
          },
        ],
      });

      const result = await service.me('admin-1');
      expect(result.roles).toEqual(['SUPER_ADMIN', 'MODERATOR']);
      expect(result.permissions).toEqual([
        'users:read',
        'users:write',
        'posts:delete',
      ]);
    });
  });

  describe('refresh token flow', () => {
    it('throws when rawRefresh token is not provided', async () => {
      await expect(service.refresh('', {})).rejects.toThrow(
        'Refresh token required',
      );
    });

    it('throws when refresh token is malformed or invalid', async () => {
      await expect(service.refresh('invalid-token', {})).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('throws when refresh token does not match stored record or adminId differs', async () => {
      const token = jwtService.sign(
        { sub: 'admin-1', email: 'admin@circlesfera.com', jti: 'jti-1' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(token, {})).rejects.toThrow(
        'Refresh token revoked',
      );
    });

    it('deletes token and throws when refresh token has expired in DB', async () => {
      const token = jwtService.sign(
        { sub: 'admin-1', email: 'admin@circlesfera.com', jti: 'jti-1' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue({
        id: 'db-token-1',
        adminId: 'admin-1',
        expiresAt: new Date(Date.now() - 10000),
      });
      mockPrisma.adminRefreshToken.delete = vi.fn().mockResolvedValue({});

      await expect(service.refresh(token, {})).rejects.toThrow(
        'Refresh token expired',
      );
      expect(mockPrisma.adminRefreshToken.delete).toHaveBeenCalledWith({
        where: { id: 'db-token-1' },
      });
    });

    it('rotates refresh token and returns new session tokens', async () => {
      const token = jwtService.sign(
        { sub: 'admin-1', email: 'admin@circlesfera.com', jti: 'jti-1' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue({
        id: 'db-token-1',
        adminId: 'admin-1',
        expiresAt: new Date(Date.now() + 100000),
      });
      mockPrisma.adminRefreshToken.delete = vi.fn().mockResolvedValue({});

      const result = await service.refresh(token, {
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(mockPrisma.adminRefreshToken.delete).toHaveBeenCalledWith({
        where: { id: 'db-token-1' },
      });
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('logout, sessions, and stepUp', () => {
    it('logout removes specific refresh token if provided', async () => {
      mockPrisma.adminRefreshToken.deleteMany = vi.fn().mockResolvedValue({});

      await service.logout('admin-1', 'specific-refresh-token', {
        ip: '127.0.0.1',
      });

      expect(mockPrisma.adminRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          token: expect.any(String),
          adminId: 'admin-1',
        },
      });
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADMIN_LOGOUT',
          adminId: 'admin-1',
        }),
      });
    });

    it('logout removes all tokens for adminId if no specific token provided', async () => {
      mockPrisma.adminRefreshToken.deleteMany = vi.fn().mockResolvedValue({});

      await service.logout('admin-1');

      expect(mockPrisma.adminRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { adminId: 'admin-1' },
      });
    });

    it('listSessions queries active sessions ordered by createdAt desc', async () => {
      mockPrisma.adminRefreshToken.findMany = vi
        .fn()
        .mockResolvedValue([{ id: 'sess-1' }]);

      const sessions = await service.listSessions('admin-1');
      expect(sessions).toEqual([{ id: 'sess-1' }]);
      expect(mockPrisma.adminRefreshToken.findMany).toHaveBeenCalledWith({
        where: { adminId: 'admin-1' },
        select: {
          id: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('revokeSession deletes session matching id and adminId', async () => {
      mockPrisma.adminRefreshToken.deleteMany = vi.fn().mockResolvedValue({});

      await service.revokeSession('admin-1', 'sess-1');
      expect(mockPrisma.adminRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { id: 'sess-1', adminId: 'admin-1' },
      });
    });

    it('stepUp verifies password when provided', async () => {
      const passwordHash = await argon2.hash('stepup-pass');
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        status: 'ACTIVE',
        passwordHash,
      });

      const result = await service.stepUp('admin-1', {
        password: 'stepup-pass',
      });

      expect(result.accessToken).toBeDefined();
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADMIN_STEP_UP',
          adminId: 'admin-1',
        }),
      });
    });

    it('stepUp throws if admin is not active or both password and TOTP fail', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'INACTIVE',
      });
      await expect(service.stepUp('admin-1', {})).rejects.toThrow();

      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        passwordHash: await argon2.hash('pass'),
        totpSecret: 'enc:base32-admin-secret',
      });
      await expect(
        service.stepUp('admin-1', {
          password: 'wrong',
          totpCode: '000000',
        }),
      ).rejects.toThrow('Step-up verification failed');
    });
  });
});
