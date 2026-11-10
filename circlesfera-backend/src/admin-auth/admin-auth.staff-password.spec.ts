import { ErrorCode } from '@circlesfera/shared';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNUSED_STAFF_PASSWORD_HASH } from '../admin/staff-password.constants.js';
import type { CryptoService } from '../common/services/crypto.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AdminAuthService } from './admin-auth.service.js';

vi.mock('otplib', () => ({
  generateSecret: vi.fn(() => 'NEW_GENERATED_BASE32_SECRET'),
  generateURI: vi.fn(() => 'otpauth://totp/x'),
  verifySync: vi.fn(({ token, secret }: { token: string; secret: string }) => ({
    valid: token === '123456' && secret === 'base32-admin-secret',
  })),
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,x'),
}));

const STAFF_PASSWORD = 'a long staff password';
const ACCOUNT_PASSWORD = 'the account password';
// In the list of known leaked passwords, and long enough for staff.
const LEAKED_PASSWORD = '123456789zxcvbnm';

describe('AdminAuthService — a staff password of its own', () => {
  let service: AdminAuthService;
  let prisma: any;
  const proof = { check: vi.fn(), spend: vi.fn() };
  const crypto = {
    encrypt: vi.fn((v: string) => `enc:${v}`),
    decrypt: vi.fn((v: string) => (v.startsWith('enc:') ? v.slice(4) : v)),
  };
  let accountHash: string;
  let ownHash: string;

  const role = (name: string) => ({ role: { name, permissions: [] } });
  const identity = (over: Record<string, unknown> = {}) => ({
    id: 'admin-1',
    email: 'staff@example.com',
    status: 'ACTIVE',
    linkedUserId: 'user-1',
    passwordHash: UNUSED_STAFF_PASSWORD_HASH,
    passwordSetAt: null,
    totpEnabled: true,
    totpSecret: 'enc:base32-admin-secret',
    failedLoginCount: 0,
    lockedUntil: null,
    accessExpiresAt: null,
    roles: [role('SUPPORT')],
    _count: { passkeys: 0 },
    ...over,
  });
  const reviewer = (over: Record<string, unknown> = {}) =>
    identity({
      roles: [role('EXTERNAL_REVIEWER')],
      totpEnabled: false,
      totpSecret: null,
      accessExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      ...over,
    });
  const failuresWritten = () =>
    prisma.adminAuditLog.create.mock.calls
      .map((c: any[]) => c[0].data)
      .filter((d: any) => d.action === 'ADMIN_LOGIN_FAILED');

  beforeAll(async () => {
    accountHash = await argon2.hash(ACCOUNT_PASSWORD);
    ownHash = await argon2.hash(STAFF_PASSWORD);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      adminIdentity: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ failedLoginCount: 1 }),
      },
      // The CircleSfera account with the staff email, linked to user-1.
      signIn: {
        findUnique: vi.fn().mockResolvedValue({
          userId: 'user-1',
          password: accountHash,
          passwordResetRequiredAt: null,
        }),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
      adminRefreshToken: {
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    const env: Record<string, string> = {
      NODE_ENV: 'development',
      JWT_ADMIN_SECRET: 'test-admin-dedicated-jwt-secret-min-32-chars',
    };
    service = new AdminAuthService(
      prisma as PrismaService,
      new JwtService(),
      { get: (k: string) => env[k] } as unknown as ConfigService,
      crypto as unknown as CryptoService,
      proof as never,
    );
  });

  describe('signing in', () => {
    it('takes the staff password once the identity has its own, without looking at any account', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ passwordHash: ownHash, passwordSetAt: new Date() }),
      );

      await expect(
        service.login('staff@example.com', STAFF_PASSWORD, {}),
      ).resolves.toMatchObject({ status: 'MFA_REQUIRED' });
      expect(prisma.signIn.findUnique).not.toHaveBeenCalled();
    });

    it('refuses the account password once the identity has its own, and counts it', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ passwordHash: ownHash, passwordSetAt: new Date() }),
      );

      await expect(
        service.login('staff@example.com', ACCOUNT_PASSWORD, {}),
      ).rejects.toThrow(UnauthorizedException);
      expect(failuresWritten()).toHaveLength(1);
    });

    it('ignores an old staff hash from before staff had their own password', async () => {
      // An identity made long ago may still hold a staff hash nobody uses.
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ passwordHash: await argon2.hash('forgotten old one') }),
      );

      await expect(
        service.login('staff@example.com', 'forgotten old one', {}),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.login('staff@example.com', ACCOUNT_PASSWORD, {}),
      ).resolves.toMatchObject({ status: 'MFA_REQUIRED' });
    });

    it('still takes the linked account password while the identity has none of its own', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());

      await expect(
        service.login('staff@example.com', ACCOUNT_PASSWORD, {}),
      ).resolves.toMatchObject({ status: 'MFA_REQUIRED' });
    });

    it('refuses an identity with neither its own password nor a linked account', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ linkedUserId: null }),
      );

      await expect(
        service.login('staff@example.com', ACCOUNT_PASSWORD, {}),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('setting up the access from a link', () => {
    // The proof is right: check matches it, spend takes it once.
    const rightProof = () => {
      proof.check.mockResolvedValueOnce('matched-hash');
      proof.spend.mockResolvedValueOnce(true);
    };

    it('makes the password its own, ends every session and starts a new authenticator', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ totpEnabled: false, totpSecret: null }),
      );
      rightProof();

      const result = await service.setUpAccess(
        'Staff@Example.com',
        'link-token',
        STAFF_PASSWORD,
        { ip: '203.0.113.1' },
      );

      expect(proof.check).toHaveBeenCalledWith('admin-1', 'link-token');
      expect(proof.spend).toHaveBeenCalledWith('admin-1', 'matched-hash');
      const set = prisma.adminIdentity.update.mock.calls[0][0];
      expect(set.where).toEqual({ id: 'admin-1' });
      expect(set.data).toMatchObject({
        passwordSetAt: expect.any(Date),
        totpSecret: null,
        totpEnabled: false,
        failedLoginCount: 0,
        lockedUntil: null,
      });
      await expect(
        argon2.verify(set.data.passwordHash, STAFF_PASSWORD),
      ).resolves.toBe(true);
      expect(prisma.adminRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { adminId: 'admin-1' },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADMIN_PASSWORD_SET',
          details: 'Password set from an access link',
          ipAddress: '203.0.113.1',
        }),
      });
      expect(result).toMatchObject({
        status: 'MFA_SETUP_REQUIRED',
        secret: 'NEW_GENERATED_BASE32_SECRET',
      });
      // Nothing opens a session before the authenticator is confirmed.
      expect(prisma.adminRefreshToken.create).not.toHaveBeenCalled();
    });

    it('signs an external reviewer in at once, with no authenticator', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(reviewer());
      rightProof();

      const result = await service.setUpAccess(
        'staff@example.com',
        'ABCD-EFGH-JKLM',
        STAFF_PASSWORD,
        {},
      );

      expect(result).toMatchObject({ status: 'SIGNED_IN' });
      const set = prisma.adminIdentity.update.mock.calls[0][0];
      expect(set.data).not.toHaveProperty('totpEnabled');
      expect(prisma.adminRefreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('gives the same refusal for an unknown, disabled, expired, locked or reviewer-without-end identity, before looking at the proof', async () => {
      for (const found of [
        null,
        identity({ status: 'DISABLED' }),
        identity({ accessExpiresAt: new Date(Date.now() - 1000) }),
        identity({ lockedUntil: new Date(Date.now() + 60_000) }),
        reviewer({ accessExpiresAt: null }),
      ]) {
        prisma.adminIdentity.findUnique.mockResolvedValueOnce(found);
        await expect(
          service.setUpAccess('staff@example.com', 'tok', STAFF_PASSWORD, {}),
        ).rejects.toThrow(new UnauthorizedException('Invalid access link'));
      }
      expect(proof.check).not.toHaveBeenCalled();
      expect(prisma.signIn.findUnique).not.toHaveBeenCalled();
    });

    it('with a wrong proof says nothing about the password, counts the attempt and changes nothing', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());
      prisma.adminIdentity.update.mockResolvedValueOnce({
        failedLoginCount: 5,
      });
      proof.check.mockResolvedValue(null);

      // The account password, a leaked one and any other: the same 401.
      for (const password of [ACCOUNT_PASSWORD, LEAKED_PASSWORD]) {
        await expect(
          service.setUpAccess('staff@example.com', 'bad', password, {}),
        ).rejects.toThrow(new UnauthorizedException('Invalid access link'));
      }
      expect(prisma.signIn.findUnique).not.toHaveBeenCalled();
      expect(prisma.adminIdentity.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'admin-1' },
        data: { failedLoginCount: { increment: 1 } },
      });
      expect(prisma.adminIdentity.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'admin-1' },
        data: { lockedUntil: expect.any(Date) },
      });
      expect(failuresWritten()).toHaveLength(2);
      expect(failuresWritten()[0]).toMatchObject({
        details: 'Invalid access link',
      });
      expect(proof.spend).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('with a right proof refuses a leaked password and leaves the proof unspent', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());
      proof.check.mockResolvedValueOnce('matched-hash');

      await expect(
        service.setUpAccess('staff@example.com', 'tok', LEAKED_PASSWORD, {}),
      ).rejects.toMatchObject({ errorCode: ErrorCode.PASSWORD_LEAKED });
      expect(proof.spend).not.toHaveBeenCalled();
    });

    it('with a right proof refuses the password of the account with the staff email', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());
      proof.check.mockResolvedValueOnce('matched-hash');

      await expect(
        service.setUpAccess('staff@example.com', 'tok', ACCOUNT_PASSWORD, {}),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.STAFF_PASSWORD_IS_ACCOUNT_PASSWORD,
      });
      expect(proof.spend).not.toHaveBeenCalled();
      expect(prisma.adminIdentity.update).not.toHaveBeenCalled();
    });

    it('refuses when another attempt spent the proof first', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());
      proof.check.mockResolvedValueOnce('matched-hash');
      proof.spend.mockResolvedValueOnce(false);

      await expect(
        service.setUpAccess('staff@example.com', 'tok', STAFF_PASSWORD, {}),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('takes any password when no account has the staff email', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ linkedUserId: null }),
      );
      prisma.signIn.findUnique.mockResolvedValue(null);
      rightProof();

      await expect(
        service.setUpAccess('staff@example.com', 'tok', ACCOUNT_PASSWORD, {}),
      ).resolves.toMatchObject({ status: 'MFA_SETUP_REQUIRED' });
    });
  });

  describe('changing the password while signed in', () => {
    const change = (
      over: Partial<{
        currentPassword: string;
        newPassword: string;
        totpCode: string;
      }> = {},
      keepRefreshToken?: string,
    ) =>
      service.changePassword(
        'admin-1',
        {
          currentPassword: ACCOUNT_PASSWORD,
          newPassword: STAFF_PASSWORD,
          totpCode: '123456',
          ...over,
        },
        { keepRefreshToken },
      );

    it('sets its own password the first time, with the old password and a code, keeping this session', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());

      await change({}, 'this-refresh-token');

      const set = prisma.adminIdentity.update.mock.calls[0][0];
      await expect(
        argon2.verify(set.data.passwordHash, STAFF_PASSWORD),
      ).resolves.toBe(true);
      const ended = prisma.adminRefreshToken.deleteMany.mock.calls[0][0];
      expect(ended.where.adminId).toBe('admin-1');
      expect(ended.where.token.not).toMatch(/^[0-9a-f]{64}$/);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ADMIN_PASSWORD_SET',
          details: 'Own password set by its holder',
        }),
      });
    });

    it('changes its own password, ending every session when none is kept', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ passwordHash: ownHash, passwordSetAt: new Date() }),
      );

      await change({
        currentPassword: STAFF_PASSWORD,
        newPassword: 'another long staff password',
      });

      expect(prisma.adminRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { adminId: 'admin-1' },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: 'Password changed by its holder',
        }),
      });
    });

    it('asks a member of staff for a right code of the authenticator', async () => {
      for (const totpCode of ['000000', undefined]) {
        prisma.adminIdentity.findUnique.mockResolvedValueOnce(identity());
        await expect(change({ totpCode })).rejects.toThrow(
          UnauthorizedException,
        );
      }
      prisma.adminIdentity.findUnique.mockResolvedValueOnce(
        identity({ totpEnabled: false }),
      );
      await expect(change()).rejects.toThrow(UnauthorizedException);
      expect(failuresWritten()).toHaveLength(3);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a wrong current password and counts it', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());

      await expect(change({ currentPassword: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(failuresWritten()).toEqual([
        expect.objectContaining({ details: 'Invalid password change' }),
      ]);
    });

    it('lets an external reviewer change it without an authenticator', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        reviewer({ passwordHash: ownHash, passwordSetAt: new Date() }),
      );

      await expect(
        change({
          currentPassword: STAFF_PASSWORD,
          newPassword: 'another long staff password',
          totpCode: undefined,
        }),
      ).resolves.toBeUndefined();
    });

    it('refuses the account password as the new one', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ passwordHash: ownHash, passwordSetAt: new Date() }),
      );

      await expect(
        change({
          currentPassword: STAFF_PASSWORD,
          newPassword: ACCOUNT_PASSWORD,
        }),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.STAFF_PASSWORD_IS_ACCOUNT_PASSWORD,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses an identity that is not active, has expired or is locked', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValueOnce(
        identity({ status: 'DISABLED' }),
      );
      await expect(change()).rejects.toThrow(UnauthorizedException);
      prisma.adminIdentity.findUnique.mockResolvedValueOnce(
        identity({ accessExpiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(change()).rejects.toThrow(UnauthorizedException);
      prisma.adminIdentity.findUnique.mockResolvedValueOnce(
        identity({ lockedUntil: new Date(Date.now() + 60_000) }),
      );
      await expect(change()).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('me tells whether the identity has its own password', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValueOnce(identity());
    await expect(service.me('admin-1')).resolves.toMatchObject({
      ownPassword: false,
    });
    prisma.adminIdentity.findUnique.mockResolvedValueOnce(
      identity({ passwordHash: ownHash, passwordSetAt: new Date() }),
    );
    await expect(service.me('admin-1')).resolves.toMatchObject({
      ownPassword: true,
    });
  });

  describe('signing in with a passkey', () => {
    it('opens a staff session for an active member of staff with an authenticator', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());

      const tokens = await service.signInWithPasskey('admin-1', {
        ip: '203.0.113.1',
      });

      expect(tokens).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(prisma.adminIdentity.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ADMIN_LOGIN' }),
      });
    });

    it('opens a capped session for an external reviewer', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(reviewer());

      await expect(
        service.signInWithPasskey('admin-1', {}),
      ).resolves.toMatchObject({ accessToken: expect.any(String) });
    });

    it('refuses an identity that is unknown, disabled, expired, locked, without an authenticator, or a reviewer with no end', async () => {
      for (const found of [
        null,
        identity({ status: 'DISABLED' }),
        identity({ accessExpiresAt: new Date(Date.now() - 1000) }),
        identity({ lockedUntil: new Date(Date.now() + 60_000) }),
        identity({ totpEnabled: false }),
        reviewer({ accessExpiresAt: null }),
      ]) {
        prisma.adminIdentity.findUnique.mockResolvedValueOnce(found);
        await expect(service.signInWithPasskey('admin-1', {})).rejects.toThrow(
          new UnauthorizedException('Passkey not accepted'),
        );
      }
      expect(prisma.adminRefreshToken.create).not.toHaveBeenCalled();
    });
  });

  it('me counts the identity’s passkeys', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValueOnce({
      ...identity(),
      _count: { passkeys: 2 },
    });
    await expect(service.me('admin-1')).resolves.toMatchObject({
      passkeyCount: 2,
    });
  });
});
