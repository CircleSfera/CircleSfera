import { ErrorCode, STAFF_PASSKEYS_MAX } from '@circlesfera/shared';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '../auth/passkey/simplewebauthn.js';
import {
  STAFF_PASSKEY_CHALLENGE_TTL_MS,
  StaffPasskeyService,
  staffWebAuthnOrigins,
} from './staff-passkey.service.js';

vi.mock('../auth/passkey/simplewebauthn.js', () => ({
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: 'auth-ch' })),
  generateRegistrationOptions: vi.fn(async () => ({ challenge: 'reg-ch' })),
  verifyAuthenticationResponse: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
}));

const clientData = (challenge: string) =>
  Buffer.from(JSON.stringify({ challenge })).toString('base64url');

const env = (values: Record<string, string>) => ({
  get: (key: string) => values[key],
});

describe('staffWebAuthnOrigins', () => {
  it('takes the configured staff origins', () => {
    expect(
      staffWebAuthnOrigins(
        env({ STAFF_WEBAUTHN_ORIGIN: 'https://a.test , https://b.test' }),
        'x.test',
      ),
    ).toEqual(['https://a.test', 'https://b.test']);
  });

  it('takes only https staff origins in production', () => {
    for (const origin of [
      'http://admin.circlesfera.com',
      'https://admin.localhost',
      'https://127.0.0.1',
    ]) {
      expect(() =>
        staffWebAuthnOrigins(
          env({ NODE_ENV: 'production', STAFF_WEBAUTHN_ORIGIN: origin }),
          'circlesfera.com',
        ),
      ).toThrow(/forbidden in production/);
    }
  });

  it('otherwise uses the staff hosts under the relying party, never the participants app', () => {
    expect(
      staffWebAuthnOrigins(env({ NODE_ENV: 'production' }), 'circlesfera.com'),
    ).toEqual([
      'https://admin.circlesfera.com',
      'https://backoffice.circlesfera.com',
    ]);
    expect(staffWebAuthnOrigins(env({}), 'localhost')).toEqual([
      'http://admin.localhost:5173',
      'http://backoffice.localhost:5173',
    ]);
  });
});

describe('StaffPasskeyService', () => {
  let prisma: any;
  let service: StaffPasskeyService;
  const meta = { ip: '203.0.113.9', userAgent: 'Vitest' };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = {
      adminPasskeyChallenge: {
        create: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      adminPasskey: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 'pk-new' }),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
      adminIdentity: { update: vi.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
    service = new StaffPasskeyService(
      prisma,
      env({ NODE_ENV: 'test' }) as never,
    );
  });

  describe('adding a passkey', () => {
    const answer = {
      id: 'cred-1',
      response: {
        clientDataJSON: clientData('reg-ch'),
        transports: ['usb', 'made-up', 7],
      },
    };

    it('asks for a discoverable passkey with user verification, never one the identity has', async () => {
      prisma.adminPasskey.findMany.mockResolvedValue([
        { credentialID: 'cred-old' },
      ]);
      const before = Date.now();

      await service.registrationOptions({
        adminId: 'admin-1',
        email: 'staff@example.com',
      });

      expect(generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'localhost',
          userName: 'staff@example.com',
          excludeCredentials: [{ id: 'cred-old', type: 'public-key' }],
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
          },
        }),
      );
      const { data } = prisma.adminPasskeyChallenge.create.mock.calls[0][0];
      expect(data).toMatchObject({
        challenge: 'reg-ch',
        scope: 'REGISTRATION',
        adminId: 'admin-1',
      });
      expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + STAFF_PASSKEY_CHALLENGE_TTL_MS,
      );
      // Expired challenges go as new ones come.
      expect(prisma.adminPasskeyChallenge.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it('refuses more than the limit', async () => {
      prisma.adminPasskey.findMany.mockResolvedValue(
        Array.from({ length: STAFF_PASSKEYS_MAX }, (_, i) => ({
          credentialID: `c${i}`,
        })),
      );

      await expect(
        service.registrationOptions({ adminId: 'admin-1', email: 'e' }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.PASSKEY_LIMIT_REACHED });
      expect(generateRegistrationOptions).not.toHaveBeenCalled();
    });

    it('keeps a verified passkey with its name, from the staff origins only, and audits it', async () => {
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-1',
            publicKey: new Uint8Array([1, 2]),
            counter: 0,
          },
        },
      } as never);

      await expect(
        service.register('admin-1', answer as never, '  Work laptop ', meta),
      ).resolves.toEqual({ id: 'pk-new' });

      expect(prisma.adminPasskeyChallenge.deleteMany).toHaveBeenCalledWith({
        where: {
          challenge: 'reg-ch',
          scope: 'REGISTRATION',
          adminId: 'admin-1',
          expiresAt: { gt: expect.any(Date) },
        },
      });
      expect(verifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedChallenge: 'reg-ch',
          expectedOrigin: [
            'http://admin.localhost:5173',
            'http://backoffice.localhost:5173',
          ],
          expectedRPID: 'localhost',
          requireUserVerification: true,
        }),
      );
      expect(prisma.adminPasskey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          credentialID: 'cred-1',
          counter: 0n,
          transports: ['usb'],
          name: 'Work laptop',
        }),
        select: { id: true },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          action: 'ADMIN_PASSKEY_ADDED',
          targetId: 'pk-new',
          ipAddress: '203.0.113.9',
        }),
      });
    });

    it('refuses an answer to a challenge that is not this identity’s, or already used', async () => {
      prisma.adminPasskeyChallenge.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.register('admin-1', answer as never, undefined, meta),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.register(
          'admin-1',
          { id: 'x', response: { clientDataJSON: 'not json' } } as never,
          undefined,
          meta,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(verifyRegistrationResponse).not.toHaveBeenCalled();
      expect(prisma.adminPasskey.create).not.toHaveBeenCalled();
    });

    it('refuses an answer whose id is not text, before anything else', async () => {
      await expect(
        service.register(
          'admin-1',
          { ...answer, id: { not: 'text' } } as never,
          undefined,
          meta,
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.adminPasskeyChallenge.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses an answer that does not verify, or throws', async () => {
      vi.mocked(verifyRegistrationResponse)
        .mockResolvedValueOnce({ verified: false } as never)
        .mockRejectedValueOnce(new Error('bad origin'));

      for (let i = 0; i < 2; i += 1) {
        await expect(
          service.register('admin-1', answer as never, undefined, meta),
        ).rejects.toThrow(UnauthorizedException);
      }
      expect(prisma.adminPasskey.create).not.toHaveBeenCalled();
    });

    it('refuses when the limit was reached meanwhile', async () => {
      vi.mocked(verifyRegistrationResponse).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: { id: 'c', publicKey: new Uint8Array([1]), counter: 0 },
        },
      } as never);
      prisma.adminPasskey.count.mockResolvedValue(STAFF_PASSKEYS_MAX);

      await expect(
        service.register('admin-1', answer as never, undefined, meta),
      ).rejects.toMatchObject({ errorCode: ErrorCode.PASSKEY_LIMIT_REACHED });
      expect(prisma.adminPasskey.create).not.toHaveBeenCalled();
    });
  });

  describe('signing in with a passkey', () => {
    const answer = {
      id: 'cred-1',
      response: { clientDataJSON: clientData('auth-ch') },
    };
    const kept = {
      id: 'pk-1',
      adminId: 'admin-1',
      credentialID: 'cred-1',
      publicKey: Buffer.from([1, 2]),
      counter: 4n,
      transports: ['internal'],
    };

    it('offers any staff passkey of the device, with user verification', async () => {
      await service.authenticationOptions();

      expect(generateAuthenticationOptions).toHaveBeenCalledWith({
        rpID: 'localhost',
        userVerification: 'required',
      });
      expect(
        prisma.adminPasskeyChallenge.create.mock.calls[0][0].data,
      ).toMatchObject({
        challenge: 'auth-ch',
        scope: 'AUTHENTICATION',
        adminId: null,
      });
    });

    it('answers which passkey and whose, moves its counter on, and keeps when it was used only on request', async () => {
      prisma.adminPasskey.findUnique.mockResolvedValue(kept);
      vi.mocked(verifyAuthenticationResponse).mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 5 },
      } as never);

      await expect(service.authenticate(answer as never)).resolves.toEqual({
        adminId: 'admin-1',
        passkeyId: 'pk-1',
      });
      expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedChallenge: 'auth-ch',
          requireUserVerification: true,
          credential: expect.objectContaining({ id: 'cred-1', counter: 4 }),
        }),
      );
      expect(prisma.adminPasskey.update).toHaveBeenCalledWith({
        where: { id: 'pk-1' },
        data: { counter: 5n },
      });

      // When it was used is kept only once the sign-in is accepted.
      await service.markUsed('pk-1');
      expect(prisma.adminPasskey.update).toHaveBeenLastCalledWith({
        where: { id: 'pk-1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('gives the same refusal for a used challenge, an unknown passkey, or one that does not verify', async () => {
      await expect(
        service.authenticate({ ...answer, id: 42 } as never),
      ).rejects.toThrow(new UnauthorizedException('Passkey not accepted'));

      prisma.adminPasskeyChallenge.deleteMany.mockResolvedValueOnce({
        count: 0,
      });
      await expect(service.authenticate(answer as never)).rejects.toThrow(
        new UnauthorizedException('Passkey not accepted'),
      );

      prisma.adminPasskey.findUnique.mockResolvedValueOnce(null);
      await expect(service.authenticate(answer as never)).rejects.toThrow(
        new UnauthorizedException('Passkey not accepted'),
      );

      prisma.adminPasskey.findUnique.mockResolvedValue(kept);
      vi.mocked(verifyAuthenticationResponse)
        .mockResolvedValueOnce({ verified: false } as never)
        .mockRejectedValueOnce(new Error('counter went back'));
      for (let i = 0; i < 2; i += 1) {
        await expect(service.authenticate(answer as never)).rejects.toThrow(
          new UnauthorizedException('Passkey not accepted'),
        );
      }
      expect(prisma.adminPasskey.update).not.toHaveBeenCalled();
    });
  });

  it('lists an identity’s passkeys without their keys', async () => {
    await service.list('admin-1');

    expect(prisma.adminPasskey.findMany).toHaveBeenCalledWith({
      where: { adminId: 'admin-1' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    });
  });

  it('removes only one of the identity’s own passkeys, and audits it', async () => {
    await service.remove('admin-1', 'pk-1', meta);

    expect(prisma.adminPasskey.deleteMany).toHaveBeenCalledWith({
      where: { id: 'pk-1', adminId: 'admin-1' },
    });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'ADMIN_PASSKEY_REMOVED' }),
    });

    prisma.adminPasskey.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('admin-1', 'pk-other', meta)).rejects.toThrow(
      NotFoundException,
    );
  });
});
