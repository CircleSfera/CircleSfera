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

  describe('assertValid — TURNSTILE_BYPASS_IPS', () => {
    it('rejects a missing token when the caller IP is not in the bypass list', async () => {
      configValues.TURNSTILE_BYPASS_IPS = '10.0.0.1,10.0.0.2';

      await expect(
        service.assertValid(undefined, '203.0.113.5'),
      ).rejects.toThrow(BadRequestException);
    });

    it('skips the CAPTCHA requirement when the caller IP matches the bypass list', async () => {
      configValues.TURNSTILE_BYPASS_IPS = '10.0.0.1, 54.37.159.171';

      await expect(
        service.assertValid(undefined, '54.37.159.171'),
      ).resolves.toBeUndefined();
    });

    it('does not bypass when TURNSTILE_BYPASS_IPS is unset (no behavior change by default)', async () => {
      await expect(
        service.assertValid(undefined, '54.37.159.171'),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not bypass when remoteIp is null/undefined even if the list is configured', async () => {
      configValues.TURNSTILE_BYPASS_IPS = '54.37.159.171';

      await expect(service.assertValid(undefined, null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ignores blank entries and surrounding whitespace in the list', async () => {
      configValues.TURNSTILE_BYPASS_IPS = ' , 54.37.159.171 ,,';

      await expect(
        service.assertValid(undefined, '54.37.159.171'),
      ).resolves.toBeUndefined();
    });

    it('still requires a valid token for a bypass-list IP if TURNSTILE_BYPASS_IPS does not match it', async () => {
      configValues.TURNSTILE_BYPASS_IPS = '10.0.0.9';

      await expect(service.assertValid(undefined, '10.0.0.10')).rejects.toThrow(
        BadRequestException,
      );
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
