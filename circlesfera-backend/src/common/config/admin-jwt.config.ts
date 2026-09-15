import type { ConfigService } from '@nestjs/config';

export const DEV_ADMIN_JWT_FALLBACK_SECRET =
  'dev-admin-jwt-fallback-secret-min-32-chars-change-in-production';

/**
 * Resolves the dedicated admin JWT secret.
 *
 * Rules:
 * 1. In production (NODE_ENV === 'production'):
 *    - JWT_ADMIN_SECRET must be explicitly provided. If missing or empty, throws an Error.
 *    - JWT_ADMIN_SECRET cannot be identical to the platform JWT_SECRET. If identical, throws an Error.
 * 2. In non-production environments:
 *    - If JWT_ADMIN_SECRET is provided and equals JWT_SECRET, throws an Error to prevent secret reuse.
 *    - If JWT_ADMIN_SECRET is provided and distinct, returns it.
 *    - If JWT_ADMIN_SECRET is omitted, returns DEV_ADMIN_JWT_FALLBACK_SECRET (which is distinct from any platform secret).
 */
export function getAdminJwtSecret(config: ConfigService): string {
  const nodeEnv = config.get<string>('NODE_ENV') || process.env.NODE_ENV;
  const isProduction = nodeEnv === 'production';
  const adminSecret = config.get<string>('JWT_ADMIN_SECRET')?.trim();
  const platformSecret = config.get<string>('JWT_SECRET')?.trim();

  if (isProduction) {
    if (!adminSecret) {
      throw new Error(
        'Missing JWT_ADMIN_SECRET: A dedicated admin JWT secret is strictly required in production environments.',
      );
    }
    if (platformSecret && adminSecret === platformSecret) {
      throw new Error(
        'Invalid JWT_ADMIN_SECRET: Admin JWT secret cannot be identical to the user platform JWT_SECRET in production.',
      );
    }
    return adminSecret;
  }

  if (adminSecret) {
    if (platformSecret && adminSecret === platformSecret) {
      throw new Error(
        'Invalid JWT_ADMIN_SECRET: Admin JWT secret cannot be identical to the user platform JWT_SECRET.',
      );
    }
    return adminSecret;
  }

  return DEV_ADMIN_JWT_FALLBACK_SECRET;
}
