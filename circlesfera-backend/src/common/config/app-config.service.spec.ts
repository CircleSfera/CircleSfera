import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AppConfigService } from './app-config.service.js';

function createMockConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const val = values[key];
      if (!val) throw new Error(`Missing ${key}`);
      return val;
    },
  } as unknown as ConfigService;
}

describe('AppConfigService', () => {
  it('provides sensible defaults when optional environment keys are absent', () => {
    const mock = createMockConfig({});
    const service = new AppConfigService(mock);

    expect(service.nodeEnv).toBe('development');
    expect(service.isProduction).toBe(false);
    expect(service.isTest).toBe(false);
    expect(service.port).toBe(3000);
    expect(service.frontendUrl).toBe('http://localhost:5173');
    expect(service.databaseUrl).toBeUndefined();
    expect(service.jwtSecret).toBe('');
    expect(service.csrfSecret).toBe('');
    expect(service.redisHost).toBe('localhost');
    expect(service.redisPort).toBe(6379);
    expect(service.redisPassword).toBeUndefined();
  });

  it('reads configured values accurately', () => {
    const mock = createMockConfig({
      NODE_ENV: 'production',
      PORT: 8080,
      FRONTEND_URL: 'https://circlesfera.com',
      DATABASE_URL: 'postgresql://db:5432/cs',
      JWT_SECRET: 'jwt-prod-sec',
      JWT_ADMIN_SECRET: 'admin-prod-sec',
      CSRF_SECRET: 'csrf-prod-sec',
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: 6380,
      REDIS_PASSWORD: 'redis-secret-pass',
      SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/default',
      SLACK_WEBHOOK_ALERTS: 'https://hooks.slack.com/services/alerts',
    });
    const service = new AppConfigService(mock);

    expect(service.nodeEnv).toBe('production');
    expect(service.isProduction).toBe(true);
    expect(service.isTest).toBe(false);
    expect(service.port).toBe(8080);
    expect(service.frontendUrl).toBe('https://circlesfera.com');
    expect(service.databaseUrl).toBe('postgresql://db:5432/cs');
    expect(service.jwtSecret).toBe('jwt-prod-sec');
    expect(service.adminJwtSecret).toBe('admin-prod-sec');
    expect(service.csrfSecret).toBe('csrf-prod-sec');
    expect(service.redisHost).toBe('redis.internal');
    expect(service.redisPort).toBe(6380);
    expect(service.redisPassword).toBe('redis-secret-pass');

    const webhooks = service.slackWebhooks;
    expect(webhooks.default).toBe('https://hooks.slack.com/services/default');
    expect(webhooks.alerts).toBe('https://hooks.slack.com/services/alerts');
    expect(webhooks.moderation).toBe(
      'https://hooks.slack.com/services/default',
    );
    expect(service.get('CUSTOM_PROP')).toBeUndefined();
  });
});
