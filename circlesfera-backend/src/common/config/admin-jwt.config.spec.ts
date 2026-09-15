import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import {
  DEV_ADMIN_JWT_FALLBACK_SECRET,
  getAdminJwtSecret,
} from './admin-jwt.config.js';

function createMockConfig(
  env: Record<string, string | undefined>,
): ConfigService {
  return {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const val = env[key];
      if (!val) throw new Error(`Config key "${key}" does not exist`);
      return val;
    },
  } as unknown as ConfigService;
}

describe('admin-jwt.config', () => {
  describe('production mode', () => {
    it('throws when JWT_ADMIN_SECRET is missing', () => {
      const config = createMockConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'user-platform-secret-1234567890-abcdef',
      });

      expect(() => getAdminJwtSecret(config)).toThrow(
        /Missing JWT_ADMIN_SECRET.*strictly required in production/,
      );
    });

    it('throws when JWT_ADMIN_SECRET is empty whitespace', () => {
      const config = createMockConfig({
        NODE_ENV: 'production',
        JWT_ADMIN_SECRET: '   ',
        JWT_SECRET: 'user-platform-secret-1234567890-abcdef',
      });

      expect(() => getAdminJwtSecret(config)).toThrow(
        /Missing JWT_ADMIN_SECRET.*strictly required in production/,
      );
    });

    it('throws when JWT_ADMIN_SECRET is identical to JWT_SECRET', () => {
      const sharedSecret = 'shared-secret-that-must-be-rejected-123456';
      const config = createMockConfig({
        NODE_ENV: 'production',
        JWT_ADMIN_SECRET: sharedSecret,
        JWT_SECRET: sharedSecret,
      });

      expect(() => getAdminJwtSecret(config)).toThrow(
        /cannot be identical to the user platform JWT_SECRET in production/,
      );
    });

    it('returns dedicated secret when valid and distinct', () => {
      const config = createMockConfig({
        NODE_ENV: 'production',
        JWT_ADMIN_SECRET: 'admin-dedicated-secret-prod-123456789',
        JWT_SECRET: 'user-platform-secret-prod-987654321',
      });

      expect(getAdminJwtSecret(config)).toBe(
        'admin-dedicated-secret-prod-123456789',
      );
    });
  });

  describe('non-production mode', () => {
    it('returns development fallback secret when JWT_ADMIN_SECRET is omitted', () => {
      const config = createMockConfig({
        NODE_ENV: 'development',
        JWT_SECRET: 'user-dev-secret',
      });

      expect(getAdminJwtSecret(config)).toBe(DEV_ADMIN_JWT_FALLBACK_SECRET);
    });

    it('returns explicit JWT_ADMIN_SECRET when provided and distinct', () => {
      const config = createMockConfig({
        NODE_ENV: 'development',
        JWT_ADMIN_SECRET: 'custom-admin-dev-secret',
        JWT_SECRET: 'user-dev-secret',
      });

      expect(getAdminJwtSecret(config)).toBe('custom-admin-dev-secret');
    });

    it('throws when explicit JWT_ADMIN_SECRET matches JWT_SECRET', () => {
      const config = createMockConfig({
        NODE_ENV: 'development',
        JWT_ADMIN_SECRET: 'same-secret-1234',
        JWT_SECRET: 'same-secret-1234',
      });

      expect(() => getAdminJwtSecret(config)).toThrow(
        /cannot be identical to the user platform JWT_SECRET/,
      );
    });
  });
});
