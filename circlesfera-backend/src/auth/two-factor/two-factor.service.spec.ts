import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue('CircleSfera'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfigService.get.mockReturnValue('CircleSfera');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTwoFactorAuthenticationSecret', () => {
    it('generates a secret, persists it, and returns the otpauth URI', async () => {
      const result = await service.generateTwoFactorAuthenticationSecret({
        id: 'user-1',
        email: 'user@example.com',
      });

      expect(generateSecret).toHaveBeenCalled();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorSecret: 'GENERATED_SECRET' },
      });
      expect(result.secret).toBe('GENERATED_SECRET');
      expect(result.otpauthUrl).toContain('user@example.com');
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

    it('delegates to otplib and returns true for a valid code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: 'GENERATED_SECRET',
      });
      vi.mocked(verifySync).mockReturnValue({ valid: true, delta: 0 });

      const isValid = await service.isTwoFactorAuthenticationCodeValid(
        '123456',
        { id: 'user-1' },
      );

      expect(verifySync).toHaveBeenCalledWith({
        token: '123456',
        secret: 'GENERATED_SECRET',
      });
      expect(isValid).toBe(true);
    });

    it('returns false for an invalid code', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: 'GENERATED_SECRET',
      });
      vi.mocked(verifySync).mockReturnValue({ valid: false, delta: 0 });

      const isValid = await service.isTwoFactorAuthenticationCodeValid(
        'wrong-code',
        { id: 'user-1' },
      );

      expect(isValid).toBe(false);
    });
  });

  describe('turnOnTwoFactorAuthentication', () => {
    it('enables 2FA when the code is valid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: 'GENERATED_SECRET',
      });
      vi.mocked(verifySync).mockReturnValue({ valid: true, delta: 0 });

      await service.turnOnTwoFactorAuthentication('user-1', '123456');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isTwoFactorEnabled: true },
      });
    });

    it('throws BadRequestException when the code is invalid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: 'GENERATED_SECRET',
      });
      vi.mocked(verifySync).mockReturnValue({ valid: false, delta: 0 });

      await expect(
        service.turnOnTwoFactorAuthentication('user-1', 'bad-code'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('turnOffTwoFactorAuthentication', () => {
    it('disables 2FA and clears the stored secret when the code is valid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: 'GENERATED_SECRET',
      });
      vi.mocked(verifySync).mockReturnValue({ valid: true, delta: 0 });

      await service.turnOffTwoFactorAuthentication('user-1', '123456');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isTwoFactorEnabled: false, twoFactorSecret: null },
      });
    });

    it('throws BadRequestException when the code is invalid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        twoFactorSecret: 'GENERATED_SECRET',
      });
      vi.mocked(verifySync).mockReturnValue({ valid: false, delta: 0 });

      await expect(
        service.turnOffTwoFactorAuthentication('user-1', 'bad-code'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });
});
