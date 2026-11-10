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
  const proof = { consume: vi.fn() };
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
    it('makes the password its own, ends every session and starts a new authenticator', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ totpEnabled: false, totpSecret: null }),
      );
      proof.consume.mockResolvedValueOnce(true);

      const result = await service.setUpAccess(
        'Staff@Example.com',
        'link-token',
        STAFF_PASSWORD,
        { ip: '203.0.113.1' },
      );

      expect(proof.consume).toHaveBeenCalledWith('admin-1', 'link-token');
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
      proof.consume.mockResolvedValueOnce(true);

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

    it('refuses a reviewer whose access has no valid end', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        reviewer({ accessExpiresAt: null }),
      );

      await expect(
        service.setUpAccess('staff@example.com', 'tok', STAFF_PASSWORD, {}),
      ).rejects.toThrow(UnauthorizedException);
      expect(proof.consume).not.toHaveBeenCalled();
    });

    it('refuses an unknown, disabled or expired identity before looking at the proof', async () => {
      for (const found of [
        null,
        identity({ status: 'DISABLED' }),
        identity({ accessExpiresAt: new Date(Date.now() - 1000) }),
      ]) {
        prisma.adminIdentity.findUnique.mockResolvedValueOnce(found);
        await expect(
          service.setUpAccess('staff@example.com', 'tok', STAFF_PASSWORD, {}),
        ).rejects.toThrow(UnauthorizedException);
      }
      expect(proof.consume).not.toHaveBeenCalled();
    });

    it('refuses a locked identity', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ lockedUntil: new Date(Date.now() + 60_000) }),
      );

      await expect(
        service.setUpAccess('staff@example.com', 'tok', STAFF_PASSWORD, {}),
      ).rejects.toThrow(ForbiddenException);
      expect(proof.consume).not.toHaveBeenCalled();
    });

    it('refuses a leaked password and leaves the link usable', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());

      await expect(
        service.setUpAccess('staff@example.com', 'tok', LEAKED_PASSWORD, {}),
      ).rejects.toMatchObject({ errorCode: ErrorCode.PASSWORD_LEAKED });
      expect(proof.consume).not.toHaveBeenCalled();
    });

    it('refuses the password of the CircleSfera account with the staff email', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());

      await expect(
        service.setUpAccess('staff@example.com', 'tok', ACCOUNT_PASSWORD, {}),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.STAFF_PASSWORD_IS_ACCOUNT_PASSWORD,
      });
      expect(proof.consume).not.toHaveBeenCalled();
      expect(prisma.adminIdentity.update).not.toHaveBeenCalled();
    });

    it('takes any password when no account has the staff email', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(
        identity({ linkedUserId: null }),
      );
      prisma.signIn.findUnique.mockResolvedValue(null);
      proof.consume.mockResolvedValueOnce(true);

      await expect(
        service.setUpAccess('staff@example.com', 'tok', ACCOUNT_PASSWORD, {}),
      ).resolves.toMatchObject({ status: 'MFA_SETUP_REQUIRED' });
    });

    it('counts a wrong proof towards the lockout and changes nothing', async () => {
      prisma.adminIdentity.findUnique.mockResolvedValue(identity());
      prisma.adminIdentity.update.mockResolvedValueOnce({
        failedLoginCount: 5,
      });
      proof.consume.mockResolvedValueOnce(false);

      await expect(
        service.setUpAccess('staff@example.com', 'bad', STAFF_PASSWORD, {}),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.adminIdentity.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'admin-1' },
        data: { failedLoginCount: { increment: 1 } },
      });
      expect(prisma.adminIdentity.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'admin-1' },
        data: { lockedUntil: expect.any(Date) },
      });
      expect(failuresWritten()).toEqual([
        expect.objectContaining({ details: 'Invalid access link' }),
      ]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
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
});
