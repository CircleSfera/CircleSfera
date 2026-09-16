import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  PORT = 3000;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsOptional()
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_ADMIN_SECRET?: string;

  @IsString()
  @IsOptional()
  CSRF_SECRET?: string;

  @IsString()
  @IsOptional()
  FRONTEND_URL = 'http://localhost:5173';

  @IsString()
  @IsOptional()
  REDIS_HOST = 'localhost';

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  REDIS_PORT = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsOptional()
  SLACK_WEBHOOK_URL?: string;

  @IsString()
  @IsOptional()
  SLACK_WEBHOOK_ALERTS?: string;

  @IsString()
  @IsOptional()
  SLACK_WEBHOOK_MODERATION?: string;

  @IsString()
  @IsOptional()
  SLACK_WEBHOOK_PAYMENTS?: string;

  @IsString()
  @IsOptional()
  SLACK_WEBHOOK_SUPPORT?: string;
}

/**
 * Validates and transforms environment variables for the centralized config boundary.
 * Enforces production invariants for critical security credentials.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }

  // Enforce production security invariants
  if (validatedConfig.NODE_ENV === Environment.Production) {
    if (!validatedConfig.JWT_SECRET) {
      throw new Error(
        'Missing JWT_SECRET: A platform JWT secret is strictly required in production environments.',
      );
    }
    if (!validatedConfig.JWT_ADMIN_SECRET) {
      throw new Error(
        'Missing JWT_ADMIN_SECRET: A dedicated admin JWT secret is strictly required in production environments.',
      );
    }
    if (validatedConfig.JWT_SECRET === validatedConfig.JWT_ADMIN_SECRET) {
      throw new Error(
        'Invalid JWT_ADMIN_SECRET: Admin JWT secret cannot be identical to user platform JWT_SECRET in production.',
      );
    }
    if (!validatedConfig.CSRF_SECRET) {
      throw new Error(
        'Missing CSRF_SECRET: CSRF_SECRET is strictly required in production environments.',
      );
    }
  }

  return validatedConfig;
}
