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
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'WEBAUTHN_RP_ID') return 'localhost';
      if (key === 'WEBAUTHN_ORIGIN') return 'http://localhost:5173';
      return null;
    }),
  };

  beforeEach(async () => {
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
});
