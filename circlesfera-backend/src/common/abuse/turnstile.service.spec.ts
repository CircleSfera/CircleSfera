import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemSettingsService } from '../../system-settings/system-settings.service.js';
import { TurnstileService } from './turnstile.service.js';

describe('TurnstileService', () => {
  let service: TurnstileService;

  const configValues: Record<string, string | undefined> = {};
  const mockConfigService = {
    get: vi.fn((key: string) => configValues[key]),
  };

  const mockSystemSettings = {
    isEnabled: vi.fn(),
  };

  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(async () => {
    for (const key of Object.keys(configValues)) delete configValues[key];
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurnstileService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SystemSettingsService, useValue: mockSystemSettings },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<TurnstileService>(TurnstileService);
    mockSystemSettings.isEnabled.mockResolvedValue(true);
    configValues.TURNSTILE_SECRET_KEY = 'secret';
    mockCache.get.mockResolvedValue(0);
  });

  describe('assertValid — post-deploy bypass token', () => {
    const TOKEN = 'a'.repeat(64);

    it('skips the CAPTCHA only for the exact bypass token', async () => {
      configValues.TURNSTILE_BYPASS_TOKEN = TOKEN;

      await expect(
        service.assertValid(undefined, '203.0.113.5', TOKEN),
      ).resolves.toBeUndefined();
    });

    it('rejects a wrong or truncated token', async () => {
      configValues.TURNSTILE_BYPASS_TOKEN = TOKEN;

      await expect(
        service.assertValid(undefined, '203.0.113.5', 'b'.repeat(64)),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.assertValid(undefined, '203.0.113.5', TOKEN.slice(1)),
      ).rejects.toThrow(BadRequestException);
    });

    it('never bypasses when no token is configured', async () => {
      await expect(
        service.assertValid(undefined, '203.0.113.5', TOKEN),
      ).rejects.toThrow(BadRequestException);
    });

    it('never bypasses with a configured token shorter than 32 characters', async () => {
      configValues.TURNSTILE_BYPASS_TOKEN = 'short';

      await expect(
        service.assertValid(undefined, '203.0.113.5', 'short'),
      ).rejects.toThrow(BadRequestException);
    });

    it('an IP, even the deploy server one, never skips the CAPTCHA', async () => {
      configValues.TURNSTILE_BYPASS_TOKEN = TOKEN;
      configValues.TURNSTILE_BYPASS_IPS = '54.37.159.171';

      await expect(
        service.assertValid(undefined, '54.37.159.171'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assertValid — pre-existing behavior unaffected', () => {
    it('returns immediately when Turnstile is not required', async () => {
      mockSystemSettings.isEnabled.mockResolvedValue(false);

      await expect(
        service.assertValid(undefined, '203.0.113.5'),
      ).resolves.toBeUndefined();
    });
  });
});
