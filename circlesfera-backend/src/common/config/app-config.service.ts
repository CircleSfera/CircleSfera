import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAdminJwtSecret } from './admin-jwt.config.js';

/**
 * Centralized typed configuration boundary.
 * Provides a single, validated access path for all critical platform configurations.
 */
@Injectable()
export class AppConfigService {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV') || 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get port(): number {
    return this.configService.get<number>('PORT') || 3000;
  }

  get frontendUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    );
  }

  get databaseUrl(): string | undefined {
    return this.configService.get<string>('DATABASE_URL');
  }

  get jwtSecret(): string {
    return this.configService.get<string>('JWT_SECRET') || '';
  }

  get adminJwtSecret(): string {
    return getAdminJwtSecret(this.configService);
  }

  get csrfSecret(): string {
    return this.configService.get<string>('CSRF_SECRET') || '';
  }

  get redisHost(): string {
    return this.configService.get<string>('REDIS_HOST') || 'localhost';
  }

  get redisPort(): number {
    return this.configService.get<number>('REDIS_PORT') || 6379;
  }

  get redisPassword(): string | undefined {
    return this.configService.get<string>('REDIS_PASSWORD');
  }

  get slackWebhooks() {
    const defaultUrl = this.configService.get<string>('SLACK_WEBHOOK_URL');
    return {
      default: defaultUrl,
      alerts:
        this.configService.get<string>('SLACK_WEBHOOK_ALERTS') || defaultUrl,
      moderation:
        this.configService.get<string>('SLACK_WEBHOOK_MODERATION') ||
        defaultUrl,
      payments:
        this.configService.get<string>('SLACK_WEBHOOK_PAYMENTS') || defaultUrl,
      support:
        this.configService.get<string>('SLACK_WEBHOOK_SUPPORT') || defaultUrl,
    };
  }

  get<T = unknown>(propertyPath: string): T | undefined {
    return this.configService.get<T>(propertyPath);
  }
}
