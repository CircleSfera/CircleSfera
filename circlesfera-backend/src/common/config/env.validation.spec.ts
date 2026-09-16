import { describe, expect, it } from 'vitest';
import { Environment, validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('supplies default configuration values in development mode', () => {
    const validated = validateEnv({});
    expect(validated.NODE_ENV).toBe(Environment.Development);
    expect(validated.PORT).toBe(3000);
    expect(validated.FRONTEND_URL).toBe('http://localhost:5173');
    expect(validated.REDIS_HOST).toBe('localhost');
    expect(validated.REDIS_PORT).toBe(6379);
  });

  it('parses valid custom configurations', () => {
    const validated = validateEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/cs_test',
      FRONTEND_URL: 'https://app.circlesfera.com',
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
    });

    expect(validated.NODE_ENV).toBe(Environment.Test);
    expect(validated.PORT).toBe(4000);
    expect(validated.DATABASE_URL).toBe(
      'postgresql://postgres:postgres@localhost:5432/cs_test',
    );
    expect(validated.FRONTEND_URL).toBe('https://app.circlesfera.com');
    expect(validated.REDIS_HOST).toBe('redis.internal');
    expect(validated.REDIS_PORT).toBe(6380);
  });

  it('rejects invalid NODE_ENV enum value', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
      }),
    ).toThrow(/Environment validation failed/);
  });

  it('rejects invalid PORT type', () => {
    expect(() =>
      validateEnv({
        PORT: 'not-a-number',
      }),
    ).toThrow(/Environment validation failed/);
  });

  describe('production environment invariants', () => {
    const validProdBase = {
      NODE_ENV: 'production',
      JWT_SECRET: 'user-prod-secret-1234567890',
      JWT_ADMIN_SECRET: 'admin-prod-secret-0987654321',
      CSRF_SECRET: 'csrf-prod-secret-abcdef123456',
    };

    it('passes when all production secrets are valid and distinct', () => {
      const validated = validateEnv(validProdBase);
      expect(validated.NODE_ENV).toBe(Environment.Production);
      expect(validated.JWT_SECRET).toBe('user-prod-secret-1234567890');
    });

    it('throws if JWT_SECRET is missing in production', () => {
      const config = { ...validProdBase, JWT_SECRET: undefined };
      expect(() => validateEnv(config)).toThrow(/Missing JWT_SECRET/);
    });

    it('throws if JWT_ADMIN_SECRET is missing in production', () => {
      const config = { ...validProdBase, JWT_ADMIN_SECRET: undefined };
      expect(() => validateEnv(config)).toThrow(/Missing JWT_ADMIN_SECRET/);
    });

    it('throws if JWT_ADMIN_SECRET is identical to JWT_SECRET in production', () => {
      const config = {
        ...validProdBase,
        JWT_SECRET: 'same-secret-123456789',
        JWT_ADMIN_SECRET: 'same-secret-123456789',
      };
      expect(() => validateEnv(config)).toThrow(/Invalid JWT_ADMIN_SECRET/);
    });

    it('throws if CSRF_SECRET is missing in production', () => {
      const config = { ...validProdBase, CSRF_SECRET: undefined };
      expect(() => validateEnv(config)).toThrow(/Missing CSRF_SECRET/);
    });
  });
});
