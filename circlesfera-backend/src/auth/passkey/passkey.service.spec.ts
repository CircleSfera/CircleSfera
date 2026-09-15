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
        passkeys: [],
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
  });
});
