import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from '../../common/services/crypto.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TwoFactorService } from './two-factor.service.js';

vi.mock('otplib', () => ({
  generateSecret: vi.fn(() => 'GENERATED_SECRET'),
  generateURI: vi.fn(
    ({ issuer, label }: { issuer: string; label: string }) =>
      `otpauth://totp/${issuer}:${label}?secret=GENERATED_SECRET`,
  ),
  verifySync: vi.fn(),
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${url}`),
}));

import { generateSecret, verifySync } from 'otplib';

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let cryptoService: CryptoService;

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'ENCRYPTION_KEY') return 'test-32-character-secret-key!!!!';
      if (key === 'APP_NAME') return 'CircleSfera';
      return null;
    }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        CryptoService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
    cryptoService = module.get<CryptoService>(CryptoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTwoFactorAuthenticationSecret', () => {
    it('generates a secret, encrypts it before persistence, and returns the plaintext to user', async () => {
      const result = await service.generateTwoFactorAuthenticationSecret({
        id: 'user-1',
        email: 'user@example.com',
      });

      expect(generateSecret).toHaveBeenCalled();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          twoFactorSecret: expect.stringMatching(
            /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/,
          ),
        },
      });
      // The client receives plaintext for display in QR / authenticator setup
      expect(result.secret).toBe('GENERATED_SECRET');
      expect(result.otpauthUrl).toContain('user@example.com');
    });

    it('generates a QR code data URL from an OTP auth URI', async () => {
      const dataUrl = await service.generateQrCodeDataURL(
        'otpauth://totp/CircleSfera:user@test.com?secret=XYZ',
      );
      expect(dataUrl).toBe(
        'data:image/png;base64,otpauth://totp/CircleSfera:user@test.com?secret=XYZ',
      );
    });
  });

  describe('isTwoFactorAuthenticationCodeValid', () => {
    it('returns false when the user has no stored secret', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: null,
      });

      const isValid = await service.isTwoFactorAuthenticationCodeValid(
        '123456',
        { id: 'user-1' },
      );

      expect(isValid).toBe(false);
      expect(verifySync).not.toHaveBeenCalled();
    });

    it('returns false when the user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const isValid = await service.isTwoFactorAuthenticationCodeValid(
        '123456',
        { id: 'missing-user' },
      );

      expect(isValid).toBe(false);
    });

    it('decrypts stored ciphertext and delegates to otplib for validation', async () => {
      const encryptedSecret = cryptoService.encrypt('MY_TEST_SECRET');
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: encryptedSecret,
      });
      vi.mocked(verifySync).mockReturnValue({ valid: true, delta: 0 });

      const isValid = await service.isTwoFactorAuthenticationCodeValid(
        '123456',
        { id: 'user-1' },
      );

      expect(verifySync).toHaveBeenCalledWith(
        expect.objectContaining({
          token: '123456',
          secret: 'MY_TEST_SECRET',
        }),
      );
      expect(isValid).toBe(true);
      // Already encrypted, so no opportunistic migration needed
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('supports legacy unencrypted plaintext secrets and triggers opportunistic migration', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: 'LEGACY_PLAINTEXT_SECRET',
      });
      vi.mocked(verifySync).mockReturnValue({ valid: true, delta: 0 });

      const isValid = await service.isTwoFactorAuthenticationCodeValid(
        '123456',
        { id: 'user-1' },
      );

      expect(verifySync).toHaveBeenCalledWith(
        expect.objectContaining({
          token: '123456',
          secret: 'LEGACY_PLAINTEXT_SECRET',
        }),
      );
      expect(isValid).toBe(true);

      // Verify opportunistic migration was triggered to encrypt the legacy secret
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          twoFactorSecret: expect.stringMatching(
            /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/,
          ),
        },
      });
    });

    it('handles opportunistic migration update errors gracefully without failing validation', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: 'LEGACY_PLAINTEXT_SECRET',
      });
      mockPrismaService.user.update.mockRejectedValueOnce(
        new Error('DB failure'),
      );
      vi.mocked(verifySync).mockReturnValue({ valid: true, delta: 0 });

      const isValid = await service.isTwoFactorAuthenticationCodeValid(
        '123456',
        { id: 'user-1' },
      );

      expect(isValid).toBe(true);
    });

    it('returns false for an invalid code', async () => {
      const encryptedSecret = cryptoService.encrypt('GENERATED_SECRET');
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: encryptedSecret,
      });
      vi.mocked(verifySync).mockReturnValue({ valid: false });

      const isValid = await service.isTwoFactorAuthenticationCodeValid(
        'wrong-code',
        { id: 'user-1' },
      );

      expect(isValid).toBe(false);
    });
  });

  describe('turnOnTwoFactorAuthentication', () => {
    it('enables 2FA when the code is valid', async () => {
      const encryptedSecret = cryptoService.encrypt('GENERATED_SECRET');
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: encryptedSecret,
      });
      vi.mocked(verifySync).mockReturnValue({ valid: true, delta: 0 });

      await service.turnOnTwoFactorAuthentication('user-1', '123456');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isTwoFactorEnabled: true },
      });
    });

    it('throws BadRequestException when the code is invalid', async () => {
      const encryptedSecret = cryptoService.encrypt('GENERATED_SECRET');
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: encryptedSecret,
      });
      vi.mocked(verifySync).mockReturnValue({ valid: false });

      await expect(
        service.turnOnTwoFactorAuthentication('user-1', 'bad-code'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('turnOffTwoFactorAuthentication', () => {
    it('disables 2FA and clears the stored secret when the code is valid', async () => {
      const encryptedSecret = cryptoService.encrypt('GENERATED_SECRET');
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: encryptedSecret,
      });
      vi.mocked(verifySync).mockReturnValue({ valid: true, delta: 0 });

      await service.turnOffTwoFactorAuthentication('user-1', '123456');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isTwoFactorEnabled: false, twoFactorSecret: null },
      });
    });

    it('throws BadRequestException when the code is invalid', async () => {
      const encryptedSecret = cryptoService.encrypt('GENERATED_SECRET');
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: encryptedSecret,
      });
      vi.mocked(verifySync).mockReturnValue({ valid: false });

      await expect(
        service.turnOffTwoFactorAuthentication('user-1', 'bad-code'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
