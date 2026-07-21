import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from './crypto.service.js';

describe('CryptoService', () => {
  let service: CryptoService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'ENCRYPTION_KEY') return 'test-32-character-secret-key!!';
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
  });
});
