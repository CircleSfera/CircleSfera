import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from './crypto.service.js';

describe('CryptoService', () => {
  let service: CryptoService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'ENCRYPTION_KEY') return 'test-32-character-secret-key!!!!';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CryptoService>(CryptoService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should refuse to boot without ENCRYPTION_KEY', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          CryptoService,
          {
            provide: ConfigService,
            useValue: { get: vi.fn(() => null) },
          },
        ],
      }).compile(),
    ).rejects.toThrow(/ENCRYPTION_KEY/);
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt plaintext and decrypt back to original text', () => {
      const plaintext = 'Secret Message 123!';
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':');

      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should return empty/falsy text as-is', () => {
      expect(service.encrypt('')).toBe('');
      expect(service.decrypt('')).toBe('');
    });

    it('should return unencrypted text if format does not match AES-GCM tag structure', () => {
      const plain = 'unencrypted_string';
      expect(service.decrypt(plain)).toBe(plain);
    });

    it('should decrypt ciphertext produced with ENCRYPTION_KEY_LEGACY', async () => {
      const legacySecret = 'legacy-secret-key-32-chars-long!!';
      const currentSecret = 'test-32-character-secret-key!!!!';
      const legacyKey = CryptoService.deriveKey(legacySecret);
      const ciphertext = CryptoService.encryptWithKey(
        'legacy message',
        legacyKey,
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CryptoService,
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string) => {
                if (key === 'ENCRYPTION_KEY') return currentSecret;
                if (key === 'ENCRYPTION_KEY_LEGACY') return legacySecret;
                return null;
              }),
            },
          },
        ],
      }).compile();

      const withLegacy = module.get<CryptoService>(CryptoService);
      expect(withLegacy.decrypt(ciphertext)).toBe('legacy message');
    });
  });
});
