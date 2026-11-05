import { createHash } from 'node:crypto';
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

  // The CircleSfera sign-in of user-1, whose password is the staff password.
  const withSignInPassword = (
    password: string,
    extra: Record<string, unknown> = {},
  ) =>
    mockPrisma.signIn.findUnique.mockResolvedValue({
      userId: 'user-1',
      password,
      passwordResetRequiredAt: null,
      ...extra,
    });

  // The proof beyond the password; each test says whether it is right.
  const mockEnrolmentProof = { consume: vi.fn() };

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
      signIn: { findUnique: vi.fn() },
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
      mockEnrolmentProof as never,
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
        mockEnrolmentProof as never,
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
        mockEnrolmentProof as never,
      );

      expect((devService as any).adminSecret()).toBe(
        DEV_ADMIN_JWT_FALLBACK_SECRET,
      );
    });
  });

  describe('TOTP encryption at rest', () => {
    it('asks a staff member with no authenticator for a proof beyond the password, and shows nothing of it yet', async () => {
      const passwordHash = await argon2.hash('admin-password-123');
      withSignInPassword(passwordHash);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        linkedUserId: 'user-1',
        status: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
        totpEnabled: false,
        // A secret made at an earlier attempt is never shown again.
        totpSecret: 'enc:base32-admin-secret',
        roles: [],
      });

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-password-123',
        { ip: '127.0.0.1', userAgent: 'test-agent' },
      );

      expect(result).toEqual({
        status: 'ENROLMENT_PROOF_REQUIRED',
        mfaToken: expect.any(String),
      });
      expect(
        jwt.decode((result as { mfaToken: string }).mfaToken),
      ).toMatchObject({
        sub: 'admin-1',
        purpose: 'admin-enrol-proof',
      });
      expect(mockCryptoService.decrypt).not.toHaveBeenCalled();
      expect(mockPrisma.adminIdentity.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totpSecret: expect.anything() }),
        }),
      );
    });

    describe('enrolling with the proof beyond the password', () => {
      const enrolToken = (purpose = 'admin-enrol-proof') =>
        jwtService.sign(
          { sub: 'admin-1', email: 'admin@circlesfera.com', purpose },
          { secret: adminSecret, audience: 'circlesfera-admin' },
        );
      const awaiting = (over: object = {}) =>
        mockPrisma.adminIdentity.findUnique.mockResolvedValue({
          id: 'admin-1',
          email: 'admin@circlesfera.com',
          status: 'ACTIVE',
          totpEnabled: false,
          lockedUntil: null,
          failedLoginCount: 0,
          ...over,
          roles: [],
        });

      it('spends the proof, then makes, keeps encrypted and shows a new secret once', async () => {
        awaiting();
        mockEnrolmentProof.consume.mockResolvedValueOnce(true);

        const result = await service.enrol(enrolToken(), 'ABCD-EFGH-JKLM', {});

        expect(mockEnrolmentProof.consume).toHaveBeenCalledWith(
          'admin-1',
          'ABCD-EFGH-JKLM',
        );
        expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
          where: { id: 'admin-1' },
          data: {
            totpSecret: 'enc:NEW_GENERATED_BASE32_SECRET',
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });
        expect(result).toMatchObject({
          status: 'MFA_SETUP_REQUIRED',
          secret: 'NEW_GENERATED_BASE32_SECRET',
          qrCodeDataUrl: expect.stringContaining('data:image/png'),
        });
        // Confirmed with its first code at the MFA step, for this secret.
        expect(jwt.decode(result.mfaToken)).toMatchObject({
          purpose: 'admin-mfa-setup',
          secretMark: expect.stringMatching(/^[0-9a-f]{32}$/),
        });
        expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ action: 'ADMIN_ENROLMENT_USED' }),
        });
      });

      it('refuses a wrong proof, writes it down and counts it towards the lockout', async () => {
        awaiting({ failedLoginCount: 4 });
        mockEnrolmentProof.consume.mockResolvedValueOnce(false);
        mockPrisma.adminIdentity.update.mockResolvedValueOnce({
          failedLoginCount: 5,
        });

        await expect(
          service.enrol(enrolToken(), 'WRONG-PROOF', { ip: '1.2.3.4' }),
        ).rejects.toThrow('Invalid enrolment proof');

        expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
          where: { id: 'admin-1' },
          data: { failedLoginCount: { increment: 1 } },
        });
        expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
          where: { id: 'admin-1' },
          data: { lockedUntil: expect.any(Date) },
        });
        expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'ADMIN_LOGIN_FAILED',
            details: 'Invalid enrolment proof',
            ipAddress: '1.2.3.4',
          }),
        });
        expect(mockCryptoService.encrypt).not.toHaveBeenCalled();
      });

      it.each([
        ['a token of another step', () => enrolToken('admin-mfa'), {}],
        ['a token that is not one', () => 'not-a-token', {}],
        [
          'an identity that already has its authenticator',
          () => enrolToken(),
          { totpEnabled: true },
        ],
        [
          'an identity that is not active',
          () => enrolToken(),
          { status: 'DISABLED' },
        ],
        [
          'an identity locked out',
          () => enrolToken(),
          { lockedUntil: new Date(Date.now() + 60_000) },
        ],
      ])(
        'refuses %s without looking at the proof',
        async (_name, token, over) => {
          awaiting(over);

          await expect(
            service.enrol(token(), 'ANY-PROOF', {}),
          ).rejects.toThrow();
          expect(mockEnrolmentProof.consume).not.toHaveBeenCalled();
        },
      );
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
        roles: [],
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
      expect(payload.typ).toBe('access');
      expect(payload.mfa).toBe(true);
    });

    it('migrates legacy plaintext TOTP secret during stepUp', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: 'base32-admin-secret', // plaintext
        totpEnabled: true,
        role: 'SUPER_ADMIN',
        tokenVersion: 1,
        roles: [],
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
        totpEnabled: true,
        roles: [],
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
      withSignInPassword(passwordHash);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        linkedUserId: 'user-1',
        status: 'ACTIVE',
        failedLoginCount: 4,
        lockedUntil: null,
        roles: [],
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
        roles: [],
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
        roles: [],
      });

      await expect(
        service.login('locked@circlesfera.com', 'pwd', {}),
      ).rejects.toThrow('Account temporarily locked');
    });

    const activeStaff = {
      id: 'admin-1',
      email: 'admin@circlesfera.com',
      linkedUserId: 'user-1',
      status: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
      totpEnabled: true,
      roles: [],
    };

    it('accepts the password of the linked sign-in, whatever hash format it uses', async () => {
      const bcrypt = await import('bcrypt');
      withSignInPassword(await bcrypt.hash('admin-bcrypt-pass', 10));
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(activeStaff);

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-bcrypt-pass',
        {},
      );

      expect(result.status).toBe('MFA_REQUIRED');
      expect(mockPrisma.signIn.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'admin@circlesfera.com' } }),
      );
      // The staff account never stores a password of its own any more.
      expect(mockPrisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });

    it.each([
      ['an unknown stored hash format', { password: 'plain-or-sha1-hash' }],
      [
        'a sign-in that must set a new password',
        { passwordResetRequiredAt: new Date() },
      ],
      ['a sign-in that belongs to another user', { userId: 'user-2' }],
    ])('refuses the right password on %s', async (_label, signIn) => {
      withSignInPassword(await argon2.hash('right-pass'), signIn);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(activeStaff);
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('admin@circlesfera.com', 'right-pass', {}),
      ).rejects.toThrow('Invalid credentials');
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ADMIN_LOGIN_FAILED' }),
        }),
      );
    });

    it.each([
      ['a staff account linked to no user', { linkedUserId: null }, 'sign-in'],
      ['a linked user with no sign-in on the staff email', {}, 'none'],
    ])('refuses on %s', async (_label, staff, kind) => {
      if (kind === 'none') mockPrisma.signIn.findUnique.mockResolvedValue(null);
      else withSignInPassword(await argon2.hash('right-pass'));
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        ...activeStaff,
        ...staff,
      });
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('admin@circlesfera.com', 'right-pass', {}),
      ).rejects.toThrow('Invalid credentials');
    });

    it('returns invalid credentials when the password does not match', async () => {
      withSignInPassword(await argon2.hash('admin-pass'));
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(activeStaff);
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('admin@circlesfera.com', 'wrong-pass', {}),
      ).rejects.toThrow('Invalid credentials');
    });

    it('returns MFA_REQUIRED when admin has MFA enabled and configured', async () => {
      const passwordHash = await argon2.hash('admin-password');
      withSignInPassword(passwordHash);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        linkedUserId: 'user-1',
        status: 'ACTIVE',
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

    it('sends a staff member with no authenticator to enrol one', async () => {
      const passwordHash = await argon2.hash('admin-password');
      withSignInPassword(passwordHash);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        linkedUserId: 'user-1',
        status: 'ACTIVE',
        totpEnabled: false,
        totpSecret: null,
        roles: [],
      });

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-password',
        {},
      );
      expect(result.status).toBe('ENROLMENT_PROOF_REQUIRED');
      expect(result).not.toHaveProperty('secret');
      expect(result).not.toHaveProperty('tokens');
      expect(mockPrisma.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it('asks for the second factor of an enrolled staff member', async () => {
      const passwordHash = await argon2.hash('admin-password');
      withSignInPassword(passwordHash);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        linkedUserId: 'user-1',
        status: 'ACTIVE',
        totpEnabled: true,
        roles: [],
      });

      const result = await service.login(
        'admin@circlesfera.com',
        'admin-password',
        {},
      );
      expect(result.status).toBe('MFA_REQUIRED');
      expect(result).not.toHaveProperty('tokens');
      expect(mockPrisma.adminRefreshToken.create).not.toHaveBeenCalled();
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
        roles: [],
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
        roles: [],
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
        roles: [],
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
        roles: [],
      });
      await expect(service.verifyMfa(token, '123', {})).rejects.toThrow(
        'Invalid MFA code',
      );
    });

    it('refuses a set-up token that does not name the secret kept now', async () => {
      const token = jwtService.sign(
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          purpose: 'admin-mfa-setup',
          secretMark: 'a-secret-made-by-another-proof',
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
        totpEnabled: false,
        roles: [],
      });

      await expect(service.verifyMfa(token, '123456', {})).rejects.toThrow(
        'Invalid or expired MFA token',
      );
      expect(mockPrisma.adminIdentity.update).not.toHaveBeenCalled();
    });

    it('does not clear the failed attempts of an identity that still has to enrol', async () => {
      const passwordHash = await argon2.hash('admin-password-123');
      withSignInPassword(passwordHash);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        linkedUserId: 'user-1',
        status: 'ACTIVE',
        failedLoginCount: 4,
        lockedUntil: null,
        totpEnabled: false,
        roles: [],
      });

      await service.login('admin@circlesfera.com', 'admin-password-123', {});

      expect(mockPrisma.adminIdentity.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failedLoginCount: 0, lockedUntil: null },
        }),
      );
    });

    it('enables totp and logs audit during first-time setup verification', async () => {
      const token = jwtService.sign(
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          purpose: 'admin-mfa-setup',
          // The secret this token was shown with.
          secretMark: createHash('sha256')
            .update('base32-admin-secret')
            .digest('hex')
            .slice(0, 32),
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@circlesfera.com',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
        totpEnabled: false,
        roles: [],
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
        roles: [],
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

    it.each([
      ['an access token', { typ: 'access', mfa: true }],
      ['a refresh token issued without the second factor', {}],
      ['a sign-in step token', { purpose: 'admin-mfa' }],
    ])('refuses to renew from %s', async (_label, claims) => {
      const token = jwtService.sign(
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          jti: 'jti-1',
          ...claims,
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );

      await expect(service.refresh(token, {})).rejects.toThrow('Sign in again');
      expect(mockPrisma.adminRefreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('throws when refresh token does not match stored record or adminId differs', async () => {
      const token = jwtService.sign(
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          jti: 'jti-1',
          typ: 'refresh',
          mfa: true,
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh(token, {})).rejects.toThrow(
        'Refresh token revoked',
      );
    });

    it('deletes token and throws when refresh token has expired in DB', async () => {
      const token = jwtService.sign(
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          jti: 'jti-1',
          typ: 'refresh',
          mfa: true,
        },
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
        {
          sub: 'admin-1',
          email: 'admin@circlesfera.com',
          jti: 'jti-1',
          typ: 'refresh',
          mfa: true,
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue({
        id: 'db-token-1',
        adminId: 'admin-1',
        expiresAt: new Date(Date.now() + 100000),
      });
      mockPrisma.adminRefreshToken.delete = vi.fn().mockResolvedValue({});
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        totpEnabled: true,
        roles: [],
      });

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

    it.each([
      [
        'has no second factor enrolled',
        { status: 'ACTIVE', totpEnabled: false },
      ],
      ['is no longer active', { status: 'SUSPENDED', totpEnabled: true }],
      ['no longer exists', null],
    ])(
      'refuses to renew a session when the staff member %s, and spends the token',
      async (_label, admin) => {
        const token = jwtService.sign(
          {
            sub: 'admin-1',
            email: 'admin@circlesfera.com',
            jti: 'jti-1',
            typ: 'refresh',
            mfa: true,
          },
          { secret: adminSecret, audience: 'circlesfera-admin' },
        );
        mockPrisma.adminRefreshToken.findUnique.mockResolvedValue({
          id: 'db-token-1',
          adminId: 'admin-1',
          expiresAt: new Date(Date.now() + 100000),
        });
        mockPrisma.adminRefreshToken.delete = vi.fn().mockResolvedValue({});
        mockPrisma.adminIdentity.findUnique.mockResolvedValue(admin);

        await expect(service.refresh(token, {})).rejects.toThrow(
          'Sign in again',
        );
        expect(mockPrisma.adminRefreshToken.delete).toHaveBeenCalledWith({
          where: { id: 'db-token-1' },
        });
      },
    );
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

    it('stepUp refuses a staff member with no second factor enrolled', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpEnabled: false,
        totpSecret: 'enc:base32-admin-secret',
        roles: [],
      });

      await expect(
        service.stepUp('admin-1', { totpCode: '123456' }),
      ).rejects.toThrow('Step-up verification failed');
    });

    it('stepUp throws if the admin is not active or the code is wrong', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'INACTIVE',
        roles: [],
      });
      await expect(
        service.stepUp('admin-1', { totpCode: '123456' }),
      ).rejects.toThrow();

      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        linkedUserId: 'user-1',
        totpSecret: 'enc:base32-admin-secret',
        totpEnabled: true,
        roles: [],
      });
      await expect(
        service.stepUp('admin-1', { totpCode: '000000' }),
      ).rejects.toThrow('Step-up verification failed');
    });
  });
  describe('an external reviewer', () => {
    const HOUR = 60 * 60 * 1000;
    const reviewerRoles = [
      { role: { name: 'EXTERNAL_REVIEWER', permissions: [] } },
    ];
    const reviewer = (extra: Record<string, unknown> = {}) => ({
      id: 'rev-1',
      email: 'stripereview@circlesfera.com',
      linkedUserId: 'user-1',
      status: 'ACTIVE',
      totpEnabled: false,
      accessExpiresAt: new Date(Date.now() + 30 * 24 * HOUR),
      roles: reviewerRoles,
      ...extra,
    });

    it("is signed in with the password alone, the session marked as a reviewer's", async () => {
      withSignInPassword(await argon2.hash('review-password'));
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(reviewer());

      const result = await service.login(
        'stripereview@circlesfera.com',
        'review-password',
        { ip: '1.2.3.4' },
      );

      expect(result.status).toBe('SIGNED_IN');
      const { tokens } = result as { tokens: Record<string, string> };
      const access = jwt.decode(tokens.accessToken) as Record<string, unknown>;
      const refresh = jwt.decode(tokens.refreshToken) as Record<
        string,
        number | boolean
      >;
      expect(access).toMatchObject({ typ: 'access', rev: true });
      expect(access.mfa).toBeUndefined();
      expect(refresh).toMatchObject({ typ: 'refresh', rev: true });
      // The refresh token never outlives the working day of the session.
      expect(
        (refresh.exp as number) - (refresh.sst as number),
      ).toBeLessThanOrEqual(8 * 60 * 60 + 1);
      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ADMIN_LOGIN' }),
      });
    });

    it('is refused with a wrong password, like anyone', async () => {
      withSignInPassword(await argon2.hash('review-password'));
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(reviewer());
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('stripereview@circlesfera.com', 'wrong', {}),
      ).rejects.toThrow('Invalid credentials');
      expect(mockPrisma.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it('is refused when the access has no end date', async () => {
      withSignInPassword(await argon2.hash('review-password'));
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(
        reviewer({ accessExpiresAt: null }),
      );
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('stripereview@circlesfera.com', 'review-password', {}),
      ).rejects.toThrow('Invalid credentials');
      expect(mockPrisma.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it('anyone whose access has passed is refused, before the password is looked at', async () => {
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(
        reviewer({ accessExpiresAt: new Date(Date.now() - 1000) }),
      );
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('stripereview@circlesfera.com', 'review-password', {}),
      ).rejects.toThrow('Invalid credentials');
      expect(mockPrisma.signIn.findUnique).not.toHaveBeenCalled();
    });

    it('a member of staff whose access has passed cannot finish the second factor', async () => {
      const mfaToken = jwtService.sign(
        { sub: 'admin-1', email: 'a@circlesfera.com', purpose: 'admin-mfa' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      mockPrisma.adminIdentity.findUnique.mockResolvedValue({
        id: 'admin-1',
        status: 'ACTIVE',
        totpSecret: 'enc:base32-admin-secret',
        totpEnabled: true,
        accessExpiresAt: new Date(Date.now() - 1000),
        roles: [],
      });

      await expect(service.verifyMfa(mfaToken, '123456', {})).rejects.toThrow(
        'MFA not configured',
      );
    });

    const reviewerRefresh = (sst: number) =>
      jwtService.sign(
        {
          sub: 'rev-1',
          email: 'stripereview@circlesfera.com',
          jti: 'jti-r',
          typ: 'refresh',
          rev: true,
          sst,
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
    const storedToken = () =>
      mockPrisma.adminRefreshToken.findUnique.mockResolvedValue({
        id: 'db-r',
        adminId: 'rev-1',
        expiresAt: new Date(Date.now() + HOUR),
      });

    it('is renewed within the working day, keeping when the session began', async () => {
      const sst = Math.floor((Date.now() - 2 * HOUR) / 1000);
      storedToken();
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(reviewer());

      const result = await service.refresh(reviewerRefresh(sst), {});

      const refresh = jwt.decode(result.refreshToken) as Record<string, number>;
      expect(refresh.sst).toBe(sst);
      expect(refresh.exp).toBeLessThanOrEqual(sst + 8 * 60 * 60 + 1);
      const [{ data }] = mockPrisma.adminRefreshToken.create.mock.calls[0];
      expect(data.expiresAt.getTime()).toBeLessThanOrEqual(
        sst * 1000 + 8 * HOUR + 1000,
      );
    });

    it('a renewal never outlasts the access', async () => {
      storedToken();
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(
        reviewer({ accessExpiresAt: new Date(Date.now() + HOUR) }),
      );

      await service.refresh(reviewerRefresh(Math.floor(Date.now() / 1000)), {});

      const [{ data }] = mockPrisma.adminRefreshToken.create.mock.calls[0];
      expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + HOUR);
    });

    it.each([
      ['past the working day', -9 * HOUR, {}],
      [
        'once it holds another role',
        0,
        {
          roles: [
            ...reviewerRoles,
            { role: { name: 'SUPER_ADMIN', permissions: [] } },
          ],
        },
      ],
      ['once its access has no end', 0, { accessExpiresAt: null }],
      [
        'once its access has passed',
        0,
        {
          accessExpiresAt: new Date(Date.now() - 1000),
        },
      ],
    ])('is not renewed %s', async (_label, startOffset, extra) => {
      storedToken();
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(reviewer(extra));

      await expect(
        service.refresh(
          reviewerRefresh(Math.floor((Date.now() + startOffset) / 1000)),
          {},
        ),
      ).rejects.toThrow('Sign in again');
      expect(mockPrisma.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it('is refused when the access ends further than a reviewer is ever given', async () => {
      withSignInPassword(await argon2.hash('review-password'));
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(
        reviewer({ accessExpiresAt: new Date(Date.now() + 91 * 24 * HOUR) }),
      );
      mockPrisma.adminIdentity.update.mockResolvedValue({
        failedLoginCount: 1,
      });

      await expect(
        service.login('stripereview@circlesfera.com', 'review-password', {}),
      ).rejects.toThrow('Invalid credentials');
      expect(mockPrisma.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it('never finishes a second factor, renews such a session nor steps up', async () => {
      const enrolled = reviewer({
        totpEnabled: true,
        totpSecret: 'enc:base32-admin-secret',
      });
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(enrolled);

      const mfaToken = jwtService.sign(
        { sub: 'rev-1', email: 'r@circlesfera.com', purpose: 'admin-mfa' },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      await expect(service.verifyMfa(mfaToken, '123456', {})).rejects.toThrow(
        'MFA not configured',
      );

      storedToken();
      const mfaRefresh = jwtService.sign(
        {
          sub: 'rev-1',
          email: 'r@circlesfera.com',
          jti: 'j',
          typ: 'refresh',
          mfa: true,
        },
        { secret: adminSecret, audience: 'circlesfera-admin' },
      );
      await expect(service.refresh(mfaRefresh, {})).rejects.toThrow(
        'Sign in again',
      );

      await expect(
        service.stepUp('rev-1', { totpCode: '123456' }),
      ).rejects.toThrow('Step-up verification failed');
      expect(mockPrisma.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it('me tells the panel the identity is a reviewer, and until when', async () => {
      const ends = new Date(Date.now() + HOUR);
      mockPrisma.adminIdentity.findUnique.mockResolvedValue(
        reviewer({ accessExpiresAt: ends }),
      );
      await expect(service.me('rev-1')).resolves.toMatchObject({
        externalReviewer: true,
        accessExpiresAt: ends,
      });
    });
  });
});
