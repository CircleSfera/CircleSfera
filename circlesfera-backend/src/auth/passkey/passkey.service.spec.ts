import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PasskeyService } from './passkey.service.js';

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

const mockGenerateRegistrationOptions = vi.mocked(generateRegistrationOptions);
const mockVerifyRegistrationResponse = vi.mocked(verifyRegistrationResponse);
const mockGenerateAuthenticationOptions = vi.mocked(
  generateAuthenticationOptions,
);
const mockVerifyAuthenticationResponse = vi.mocked(
  verifyAuthenticationResponse,
);

describe('PasskeyService', () => {
  let service: PasskeyService;

  const challengeStore = new Map<string, any>();

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    passkey: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    passkeyChallenge: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const record = { id: `chall-${Date.now()}-${Math.random()}`, ...data };
        challengeStore.set(data.challenge, record);
        return record;
      }),
      findUnique: vi.fn(async ({ where }: { where: { challenge: string } }) => {
        return challengeStore.get(where.challenge) || null;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        for (const [key, val] of challengeStore.entries()) {
          if (val.id === where.id) {
            challengeStore.delete(key);
            return val;
          }
        }
        return null;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) =>
      cb(mockPrismaService),
    ),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'WEBAUTHN_RP_ID') return 'localhost';
      if (key === 'WEBAUTHN_ORIGIN') return 'http://localhost:5173';
      return null;
    }),
  };

  beforeEach(async () => {
    challengeStore.clear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasskeyService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<PasskeyService>(PasskeyService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateRegistrationOptions', () => {
    it('should generate options for a valid user', async () => {
      const userId = 'user-1';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'test@example.com',
        passkeys: [{ credentialID: 'existing-cred-1' }],
      });
      mockGenerateRegistrationOptions.mockResolvedValue({
        challenge: 'mock-challenge',
      } as PublicKeyCredentialCreationOptionsJSON);

      const options = await service.generateRegistrationOptions(userId);

      expect(options.challenge).toBe('mock-challenge');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { currentChallenge: 'mock-challenge' },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.generateRegistrationOptions('invalid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyRegistration', () => {
    it('should verify registration and create passkey', async () => {
      const userId = 'user-1';
      mockPrismaService.user.findUnique.mockResolvedValue({
        currentChallenge: 'expected-challenge',
      });
      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-1',
            publicKey: Buffer.from('pubkey'),
            counter: 0,
          },
        },
      } as unknown as VerifiedRegistrationResponse);

      const body = { response: { transports: ['usb'] } };
      const result = await service.verifyRegistration(userId, body);

      expect(result.verified).toBe(true);
      expect(mockPrismaService.passkey.create).toHaveBeenCalled();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { currentChallenge: null },
      });
    });

    it('should throw BadRequestException if challenge is missing', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        currentChallenge: null,
      });
      await expect(
        service.verifyRegistration('user-1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateAuthenticationOptions', () => {
    it('should generate options for valid email', async () => {
      const email = 'test@example.com';
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        passkeys: [{ credentialID: 'cred-1' }],
      });
      mockGenerateAuthenticationOptions.mockResolvedValue({
        challenge: 'auth-challenge',
      } as PublicKeyCredentialRequestOptionsJSON);

      const options = await service.generateAuthenticationOptions(email);

      expect(options.challenge).toBe('auth-challenge');
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });
  });

  describe('verifyAuthentication', () => {
    it('should verify authentication and update counter', async () => {
      const email = 'test@example.com';
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-1',
        currentChallenge: 'auth-challenge',
        passkeys: [
          {
            credentialID: 'cred-1',
            publicKey: Buffer.from('pubkey'),
            counter: 0,
            transports: [],
          },
        ],
      });
      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      } as unknown as VerifiedAuthenticationResponse);

      const body = { id: 'cred-1' };
      const result = await service.verifyAuthentication(email, body);

      expect(result.verified).toBe(true);
      expect(mockPrismaService.passkey.update).toHaveBeenCalled();
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });
  });

  describe('challenge lifecycle and security hardening', () => {
    function makeClientDataJSON(challenge: string): string {
      return Buffer.from(
        JSON.stringify({
          type: 'webauthn.create',
          challenge,
          origin: 'http://localhost:5173',
          crossOrigin: false,
        }),
      ).toString('base64url');
    }

    it('supports concurrent ceremonies without overwriting challenges', async () => {
      const userId = 'user-concurrent';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'concurrent@example.com',
        passkeys: [],
      });

      // Ceremony 1
      mockGenerateRegistrationOptions.mockResolvedValueOnce({
        challenge: 'challenge-tab-1',
      } as PublicKeyCredentialCreationOptionsJSON);
      const opt1 = await service.generateRegistrationOptions(userId);

      // Ceremony 2 in another tab
      mockGenerateRegistrationOptions.mockResolvedValueOnce({
        challenge: 'challenge-tab-2',
      } as PublicKeyCredentialCreationOptionsJSON);
      const opt2 = await service.generateRegistrationOptions(userId);

      expect(opt1.challenge).toBe('challenge-tab-1');
      expect(opt2.challenge).toBe('challenge-tab-2');

      // Both challenge records exist simultaneously
      expect(challengeStore.has('challenge-tab-1')).toBe(true);
      expect(challengeStore.has('challenge-tab-2')).toBe(true);

      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-tab-1',
            publicKey: Buffer.from('pub1'),
            counter: 0,
          },
        },
      } as unknown as VerifiedRegistrationResponse);

      // Ceremony 1 completes
      const result1 = await service.verifyRegistration(userId, {
        response: {
          clientDataJSON: makeClientDataJSON('challenge-tab-1'),
          transports: ['internal'],
        },
      });
      expect(result1.verified).toBe(true);
      expect(challengeStore.has('challenge-tab-1')).toBe(false); // Atomically consumed
      expect(challengeStore.has('challenge-tab-2')).toBe(true); // Still valid for Tab 2!

      // Ceremony 2 completes
      const result2 = await service.verifyRegistration(userId, {
        response: {
          clientDataJSON: makeClientDataJSON('challenge-tab-2'),
          transports: ['internal'],
        },
      });
      expect(result2.verified).toBe(true);
      expect(challengeStore.has('challenge-tab-2')).toBe(false); // Also consumed
    });

    it('strictly prevents challenge reuse (single-use atomic consumption)', async () => {
      const userId = 'user-replay';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'replay@example.com',
        passkeys: [],
      });
      mockGenerateRegistrationOptions.mockResolvedValueOnce({
        challenge: 'challenge-replay',
      } as PublicKeyCredentialCreationOptionsJSON);

      await service.generateRegistrationOptions(userId);

      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-replay',
            publicKey: Buffer.from('pub'),
            counter: 0,
          },
        },
      } as unknown as VerifiedRegistrationResponse);

      const payload = {
        response: {
          clientDataJSON: makeClientDataJSON('challenge-replay'),
          transports: ['internal'],
        },
      };

      // First verification succeeds
      const first = await service.verifyRegistration(userId, payload);
      expect(first.verified).toBe(true);

      // Replay attempt fails immediately because the challenge was atomically consumed
      await expect(service.verifyRegistration(userId, payload)).rejects.toThrow(
        'Challenge not found or already consumed',
      );
    });

    it('rejects expired challenges and deletes them', async () => {
      const userId = 'user-expired';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'expired@example.com',
        passkeys: [],
      });

      // Insert an already-expired challenge record directly
      challengeStore.set('challenge-old', {
        id: 'chall-old-1',
        userId,
        scope: 'REGISTRATION',
        challenge: 'challenge-old',
        expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
      });

      const payload = {
        response: {
          clientDataJSON: makeClientDataJSON('challenge-old'),
          transports: ['internal'],
        },
      };

      await expect(service.verifyRegistration(userId, payload)).rejects.toThrow(
        'Challenge has expired',
      );
      expect(challengeStore.has('challenge-old')).toBe(false);
    });

    it('handles error gracefully when deleting expired challenge throws', async () => {
      const userId = 'user-expired-err';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'expired-err@example.com',
        passkeys: [],
      });

      challengeStore.set('challenge-old-err', {
        id: 'chall-old-2',
        userId,
        scope: 'REGISTRATION',
        challenge: 'challenge-old-err',
        expiresAt: new Date(Date.now() - 60 * 1000),
      });

      const origDelete = mockPrismaService.passkeyChallenge.delete;
      mockPrismaService.passkeyChallenge.delete.mockRejectedValueOnce(
        new Error('DB connection drop during challenge delete'),
      );

      try {
        const payload = {
          response: {
            clientDataJSON: makeClientDataJSON('challenge-old-err'),
            transports: ['internal'],
          },
        };

        await expect(
          service.verifyRegistration(userId, payload),
        ).rejects.toThrow('Challenge has expired');
      } finally {
        mockPrismaService.passkeyChallenge.delete = origDelete;
      }
    });

    it('rejects challenge if scope mismatches (e.g. auth challenge sent to registration)', async () => {
      const userId = 'user-scope';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'scope@example.com',
        passkeys: [],
      });

      // Insert an AUTHENTICATION challenge record
      challengeStore.set('challenge-for-auth', {
        id: 'chall-auth-1',
        userId,
        scope: 'AUTHENTICATION',
        challenge: 'challenge-for-auth',
        expiresAt: new Date(Date.now() + 60 * 1000),
      });

      const payload = {
        response: {
          clientDataJSON: makeClientDataJSON('challenge-for-auth'),
          transports: ['internal'],
        },
      };

      // Attempt to use it for REGISTRATION
      await expect(service.verifyRegistration(userId, payload)).rejects.toThrow(
        /Challenge scope mismatch/,
      );
    });

    it('rejects challenge if user mismatches (cross-account challenge injection)', async () => {
      challengeStore.set('challenge-user-a', {
        id: 'chall-a-1',
        userId: 'user-a',
        scope: 'REGISTRATION',
        challenge: 'challenge-user-a',
        expiresAt: new Date(Date.now() + 60 * 1000),
      });

      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-b',
        email: 'b@example.com',
        passkeys: [],
      });

      const payload = {
        response: {
          clientDataJSON: makeClientDataJSON('challenge-user-a'),
          transports: ['internal'],
        },
      };

      // User B tries to consume User A's challenge
      await expect(
        service.verifyRegistration('user-b', payload),
      ).rejects.toThrow('Challenge user mismatch');
    });

    it('falls back to legacy single-slot challenge when passkeyChallenge table or record is absent', async () => {
      const userId = 'user-legacy';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        email: 'legacy@example.com',
        currentChallenge: 'legacy-challenge',
        passkeys: [],
      });

      // No challenge in challengeStore, but user.currentChallenge matches
      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-legacy',
            publicKey: Buffer.from('pub'),
            counter: 0,
          },
        },
      } as unknown as VerifiedRegistrationResponse);

      const payload = {
        response: {
          clientDataJSON: makeClientDataJSON('legacy-challenge'),
          transports: ['internal'],
        },
      };

      const result = await service.verifyRegistration(userId, payload);
      expect(result.verified).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { currentChallenge: null },
      });
    });

    it('handles legacy fallback via tx.user.findUnique when existingUserCurrentChallenge did not match', async () => {
      const userId = 'user-tx-lookup';
      // Initial user lookup returned undefined/null for currentChallenge
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: userId,
        currentChallenge: null,
      });
      // Inside transaction, tx.user.findUnique returns the challenge
      mockPrismaService.user.findUnique.mockResolvedValueOnce({
        id: userId,
        currentChallenge: 'tx-found-challenge',
      });

      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-tx',
            publicKey: Buffer.from('pub'),
            counter: 0,
          },
        },
      } as unknown as VerifiedRegistrationResponse);

      const payload = {
        challenge: 'tx-found-challenge',
        response: {
          transports: ['internal'],
        },
      };

      const result = await service.verifyRegistration(userId, payload);
      expect(result.verified).toBe(true);
    });

    it('handles direct execution when prisma.$transaction is not available', async () => {
      const userId = 'user-no-tx';
      const originalTx = mockPrismaService.$transaction;
      delete (mockPrismaService as any).$transaction;

      try {
        mockPrismaService.user.findUnique.mockResolvedValue({
          id: userId,
          email: 'notx@example.com',
          passkeys: [],
        });

        mockGenerateRegistrationOptions.mockResolvedValueOnce({
          challenge: 'challenge-no-tx',
        } as PublicKeyCredentialCreationOptionsJSON);

        await service.generateRegistrationOptions(userId);

        mockVerifyRegistrationResponse.mockResolvedValue({
          verified: true,
          registrationInfo: {
            credential: {
              id: 'cred-no-tx',
              publicKey: Buffer.from('pub'),
              counter: 0,
            },
          },
        } as unknown as VerifiedRegistrationResponse);

        const payload = {
          response: {
            clientDataJSON: makeClientDataJSON('challenge-no-tx'),
            transports: ['internal'],
          },
        };

        const result = await service.verifyRegistration(userId, payload);
        expect(result.verified).toBe(true);
      } finally {
        mockPrismaService.$transaction = originalTx;
      }
    });

    it('handles clientDataJSON JSON parse error gracefully', async () => {
      const userId = 'user-corrupt';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        currentChallenge: 'fallback-ch',
      });

      // Pass corrupted base64 clientDataJSON
      const payload = {
        response: {
          clientDataJSON: 'not-valid-base64-json!!!',
        },
      };

      const result = await service.verifyRegistration(userId, payload);
      expect(result.verified).toBe(true);
    });

    it('extracts challenge when body is null or primitive without crashing', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'u-null',
        currentChallenge: null,
      });

      await expect(service.verifyRegistration('u-null', null)).rejects.toThrow(
        'Registration challenge not found',
      );
      await expect(
        service.verifyRegistration('u-null', 'string-body'),
      ).rejects.toThrow('Registration challenge not found');
    });
  });

  describe('verifyRegistration error handling', () => {
    it('returns verified: false when verification fails', async () => {
      const userId = 'user-fail';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        currentChallenge: 'fail-ch',
      });
      challengeStore.set('fail-ch', {
        id: 'c-fail',
        userId,
        scope: 'REGISTRATION',
        challenge: 'fail-ch',
      });

      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: false,
      } as unknown as VerifiedRegistrationResponse);

      const result = await service.verifyRegistration(userId, {
        challenge: 'fail-ch',
      });
      expect(result).toEqual({ verified: false });
    });

    it('catches and wraps Error instances into BadRequestException', async () => {
      const userId = 'user-err';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        currentChallenge: 'err-ch',
      });
      challengeStore.set('err-ch', {
        id: 'c-err',
        userId,
        scope: 'REGISTRATION',
        challenge: 'err-ch',
      });

      mockVerifyRegistrationResponse.mockRejectedValue(
        new Error('Cryptographic signature failed'),
      );

      await expect(
        service.verifyRegistration(userId, { challenge: 'err-ch' }),
      ).rejects.toThrow(
        'Passkey registration failed: Cryptographic signature failed',
      );
    });

    it('catches and wraps non-Error instances into BadRequestException', async () => {
      const userId = 'user-non-err';
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: userId,
        currentChallenge: 'non-err-ch',
      });
      challengeStore.set('non-err-ch', {
        id: 'c-non-err',
        userId,
        scope: 'REGISTRATION',
        challenge: 'non-err-ch',
      });

      mockVerifyRegistrationResponse.mockRejectedValue('Unknown string crash');

      await expect(
        service.verifyRegistration(userId, { challenge: 'non-err-ch' }),
      ).rejects.toThrow('Passkey registration failed: Unknown error');
    });
  });

  describe('generateAuthenticationOptions', () => {
    it('throws NotFoundException when user is not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      await expect(
        service.generateAuthenticationOptions('missing@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyAuthentication error handling', () => {
    it('throws NotFoundException when user is not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      await expect(
        service.verifyAuthentication('missing@example.com', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when challenge is missing', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'u-no-ch',
        currentChallenge: null,
        passkeys: [],
      });

      await expect(
        service.verifyAuthentication('user@example.com', {}),
      ).rejects.toThrow('Authentication challenge not found');
    });

    it('throws BadRequestException when passkey is not found in user passkeys', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'u-1',
        currentChallenge: 'auth-ch',
        passkeys: [{ credentialID: 'different-cred' }],
      });
      challengeStore.set('auth-ch', {
        id: 'c-auth',
        userId: 'u-1',
        scope: 'AUTHENTICATION',
        challenge: 'auth-ch',
      });

      await expect(
        service.verifyAuthentication('user@example.com', {
          challenge: 'auth-ch',
          id: 'unregistered-cred',
        }),
      ).rejects.toThrow('Passkey not found');
    });

    it('returns verified: false and logs warning when verification.verified is false', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'u-1',
        currentChallenge: 'auth-ch',
        passkeys: [
          {
            credentialID: 'cred-1',
            publicKey: Buffer.from('key'),
            counter: 0,
            transports: [],
          },
        ],
      });
      challengeStore.set('auth-ch', {
        id: 'c-auth',
        userId: 'u-1',
        scope: 'AUTHENTICATION',
        challenge: 'auth-ch',
      });

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: false,
      } as unknown as VerifiedAuthenticationResponse);

      const result = await service.verifyAuthentication('user@example.com', {
        challenge: 'auth-ch',
        id: 'cred-1',
      });

      expect(result).toEqual({ verified: false });
    });

    it('catches and wraps Error instances into BadRequestException', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'u-1',
        currentChallenge: 'auth-ch',
        passkeys: [
          {
            credentialID: 'cred-1',
            publicKey: Buffer.from('key'),
            counter: 0,
            transports: [],
          },
        ],
      });
      challengeStore.set('auth-ch', {
        id: 'c-auth',
        userId: 'u-1',
        scope: 'AUTHENTICATION',
        challenge: 'auth-ch',
      });

      mockVerifyAuthenticationResponse.mockRejectedValue(
        new Error('Signature invalid'),
      );

      await expect(
        service.verifyAuthentication('user@example.com', {
          challenge: 'auth-ch',
          id: 'cred-1',
        }),
      ).rejects.toThrow('Passkey authentication failed: Signature invalid');
    });

    it('catches and wraps non-Error instances into BadRequestException', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'u-1',
        currentChallenge: 'auth-ch',
        passkeys: [
          {
            credentialID: 'cred-1',
            publicKey: Buffer.from('key'),
            counter: 0,
            transports: [],
          },
        ],
      });
      challengeStore.set('auth-ch', {
        id: 'c-auth',
        userId: 'u-1',
        scope: 'AUTHENTICATION',
        challenge: 'auth-ch',
      });

      mockVerifyAuthenticationResponse.mockRejectedValue('String crash');

      await expect(
        service.verifyAuthentication('user@example.com', {
          challenge: 'auth-ch',
          id: 'cred-1',
        }),
      ).rejects.toThrow('Passkey authentication failed: Unknown error');
    });
  });

  describe('getUserPasskeys', () => {
    it('returns all passkeys belonging to user', async () => {
      const mockList = [
        {
          id: 'pk-1',
          credentialID: 'cred-1',
          transports: ['usb'],
          createdAt: new Date(),
        },
      ];
      mockPrismaService.passkey.findMany.mockResolvedValue(mockList);

      const result = await service.getUserPasskeys('user-1');
      expect(result).toEqual(mockList);
      expect(mockPrismaService.passkey.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: {
          id: true,
          credentialID: true,
          transports: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('deletePasskey', () => {
    it('throws NotFoundException when passkey is not found', async () => {
      mockPrismaService.passkey.findUnique.mockResolvedValue(null);

      await expect(service.deletePasskey('user-1', 'pk-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when passkey belongs to another user', async () => {
      mockPrismaService.passkey.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'user-other',
      });

      await expect(service.deletePasskey('user-1', 'pk-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes passkey successfully when it belongs to the user', async () => {
      mockPrismaService.passkey.findUnique.mockResolvedValue({
        id: 'pk-1',
        userId: 'user-1',
      });
      mockPrismaService.passkey.delete.mockResolvedValue({ id: 'pk-1' });

      const result = await service.deletePasskey('user-1', 'pk-1');
      expect(result).toEqual({ deleted: true });
      expect(mockPrismaService.passkey.delete).toHaveBeenCalledWith({
        where: { id: 'pk-1' },
      });
    });
  });

  describe('User-Verification Assurance Policy (SEC-006)', () => {
    it('sets userVerification: required and scope REGISTRATION:SENSITIVE for sensitive registration', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-sensitive-reg',
        email: 'sens-reg@example.com',
        passkeys: [],
      });
      mockGenerateRegistrationOptions.mockResolvedValue({
        challenge: 'sens-reg-challenge',
      } as PublicKeyCredentialCreationOptionsJSON);

      await service.generateRegistrationOptions(
        'user-sensitive-reg',
        'sensitive',
      );

      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          authenticatorSelection: expect.objectContaining({
            userVerification: 'required',
          }),
        }),
      );

      const challengeRecord = challengeStore.get('sens-reg-challenge');
      expect(challengeRecord?.scope).toBe('REGISTRATION:SENSITIVE');
    });

    it('sets userVerification: preferred and scope REGISTRATION for standard registration', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-std-reg',
        email: 'std-reg@example.com',
        passkeys: [],
      });
      mockGenerateRegistrationOptions.mockResolvedValue({
        challenge: 'std-reg-challenge',
      } as PublicKeyCredentialCreationOptionsJSON);

      await service.generateRegistrationOptions('user-std-reg', 'standard');

      expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          authenticatorSelection: expect.objectContaining({
            userVerification: 'preferred',
          }),
        }),
      );

      const challengeRecord = challengeStore.get('std-reg-challenge');
      expect(challengeRecord?.scope).toBe('REGISTRATION');
    });

    it('rejects sensitive registration when userVerified is false', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-uv-fail',
        email: 'uv-fail@example.com',
        passkeys: [],
      });
      mockGenerateRegistrationOptions.mockResolvedValue({
        challenge: 'chall-uv-fail',
      } as PublicKeyCredentialCreationOptionsJSON);

      await service.generateRegistrationOptions('user-uv-fail', 'sensitive');

      mockVerifyRegistrationResponse.mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: 'cred-uv-fail',
            publicKey: Buffer.from('pub'),
            counter: 0,
          },
          userVerified: false, // Fails UV requirement!
        },
      } as unknown as VerifiedRegistrationResponse);

      const body = {
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: 'webauthn.create',
              challenge: 'chall-uv-fail',
              origin: 'http://localhost:5173',
            }),
          ).toString('base64url'),
          transports: ['usb'],
        },
      };

      await expect(
        service.verifyRegistration('user-uv-fail', body),
      ).rejects.toThrow(
        'Passkey registration failed: User verification is required for sensitive operations',
      );
    });

    it('sets userVerification: required and scope AUTHENTICATION:SENSITIVE for sensitive login', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-sens-auth',
        passkeys: [{ credentialID: 'cred-sens' }],
      });
      mockGenerateAuthenticationOptions.mockResolvedValue({
        challenge: 'sens-auth-challenge',
      } as PublicKeyCredentialRequestOptionsJSON);

      await service.generateAuthenticationOptions(
        'sens-auth@example.com',
        'sensitive',
      );

      expect(mockGenerateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          userVerification: 'required',
        }),
      );

      const challengeRecord = challengeStore.get('sens-auth-challenge');
      expect(challengeRecord?.scope).toBe('AUTHENTICATION:SENSITIVE');
    });

    it('rejects sensitive authentication when userVerified is false', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-auth-uv-fail',
        passkeys: [
          {
            credentialID: 'cred-auth-uv-fail',
            publicKey: Buffer.from('pub'),
            counter: 0,
            transports: [],
          },
        ],
      });
      mockGenerateAuthenticationOptions.mockResolvedValue({
        challenge: 'chall-auth-uv-fail',
      } as PublicKeyCredentialRequestOptionsJSON);

      await service.generateAuthenticationOptions(
        'auth-uv-fail@example.com',
        'sensitive',
      );

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          userVerified: false, // User presence only, no biometric UV
        },
      } as unknown as VerifiedAuthenticationResponse);

      const body = {
        id: 'cred-auth-uv-fail',
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: 'webauthn.get',
              challenge: 'chall-auth-uv-fail',
              origin: 'http://localhost:5173',
            }),
          ).toString('base64url'),
        },
      };

      await expect(
        service.verifyAuthentication('auth-uv-fail@example.com', body),
      ).rejects.toThrow(
        'Passkey authentication failed: User verification is required for sensitive operations',
      );
    });

    it('accepts standard authentication with userVerified: false (UP only allowed for login)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-std-auth',
        passkeys: [
          {
            credentialID: 'cred-std-auth',
            publicKey: Buffer.from('pub'),
            counter: 0,
            transports: [],
          },
        ],
      });
      mockGenerateAuthenticationOptions.mockResolvedValue({
        challenge: 'chall-std-auth',
      } as PublicKeyCredentialRequestOptionsJSON);

      await service.generateAuthenticationOptions(
        'std-auth@example.com',
        'standard',
      );

      mockVerifyAuthenticationResponse.mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
          userVerified: false, // Security key UP without biometric
        },
      } as unknown as VerifiedAuthenticationResponse);

      const body = {
        id: 'cred-std-auth',
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: 'webauthn.get',
              challenge: 'chall-std-auth',
              origin: 'http://localhost:5173',
            }),
          ).toString('base64url'),
        },
      };

      const result = await service.verifyAuthentication(
        'std-auth@example.com',
        body,
      );

      expect(result.verified).toBe(true);
      expect(result.userVerified).toBe(false);
    });
  });

  describe('Production WebAuthn Configuration Fail-Closed Invariant (SEC-007)', () => {
    it('throws error when initializing PasskeyService in production with localhost RP ID', () => {
      const prodConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'WEBAUTHN_RP_ID') return 'localhost';
          if (key === 'WEBAUTHN_ORIGIN') return 'https://circlesfera.com';
          return null;
        }),
      };

      expect(
        () =>
          new PasskeyService(
            mockPrismaService as any,
            prodConfigService as any,
          ),
      ).toThrow(
        'WEBAUTHN_RP_ID environment variable is required in production and cannot be localhost',
      );
    });

    it('throws error when initializing PasskeyService in production with missing WEBAUTHN_ORIGIN', () => {
      const prodConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'WEBAUTHN_RP_ID') return 'circlesfera.com';
          if (key === 'WEBAUTHN_ORIGIN') return '';
          return null;
        }),
      };

      expect(
        () =>
          new PasskeyService(
            mockPrismaService as any,
            prodConfigService as any,
          ),
      ).toThrow(
        'WEBAUTHN_ORIGIN environment variable is required in production',
      );
    });

    it('throws error when initializing PasskeyService in production with insecure HTTP origin', () => {
      const prodConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'WEBAUTHN_RP_ID') return 'circlesfera.com';
          if (key === 'WEBAUTHN_ORIGIN') return 'http://circlesfera.com';
          return null;
        }),
      };

      expect(
        () =>
          new PasskeyService(
            mockPrismaService as any,
            prodConfigService as any,
          ),
      ).toThrow(
        "Insecure WebAuthn origin 'http://circlesfera.com' is forbidden in production; HTTPS required",
      );
    });
  });
});
