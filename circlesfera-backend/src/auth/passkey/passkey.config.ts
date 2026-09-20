import type { ConfigService } from '@nestjs/config';

/**
 * Operation sensitivity tiers for Passkey ceremonies (SEC-006).
 * - 'standard': Standard passwordless login. Prefers biometric UV but allows User Presence (UP)
 *   security keys to avoid authentication lockout.
 * - 'sensitive': High-privilege operations (passkey enrollment, deletion, step-up auth).
 *   Enforces cryptographic User Verification (flags.uv === true, via biometric or device PIN).
 */
export type PasskeySensitivity = 'standard' | 'sensitive';

export type PasskeyUserVerificationRequirement =
  | 'preferred'
  | 'required'
  | 'discouraged';

export interface WebAuthnAssurancePolicy {
  userVerification: PasskeyUserVerificationRequirement;
  requireUserVerification: boolean;
}

export const PASSKEY_ASSURANCE_POLICIES: Record<
  PasskeySensitivity,
  WebAuthnAssurancePolicy
> = {
  standard: {
    userVerification: 'preferred',
    requireUserVerification: false,
  },
  sensitive: {
    userVerification: 'required',
    requireUserVerification: true,
  },
};

export function getAssurancePolicy(
  sensitivity: PasskeySensitivity = 'standard',
): WebAuthnAssurancePolicy {
  return (
    PASSKEY_ASSURANCE_POLICIES[sensitivity] ||
    PASSKEY_ASSURANCE_POLICIES.standard
  );
}

export interface WebAuthnConfig {
  rpID: string;
  rpName: string;
  origin: string[];
}

export const DEFAULT_DEV_RP_ID = 'localhost';
export const DEFAULT_DEV_ORIGIN = ['http://localhost:5173'];

/**
 * Parses and strictly validates WebAuthn configuration (SEC-007).
 * In production:
 *  - Disallows localhost fallbacks for WEBAUTHN_RP_ID and WEBAUTHN_ORIGIN.
 *  - Enforces HTTPS for all configured origins.
 * In non-production:
 *  - Safely falls back to localhost development defaults.
 */
export function parseWebAuthnConfig(
  configService: Pick<ConfigService, 'get'>,
): WebAuthnConfig {
  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const rawRpId = configService.get<string>('WEBAUTHN_RP_ID')?.trim();
  const rawOrigin = configService.get<string>('WEBAUTHN_ORIGIN')?.trim();
  const rpName =
    configService.get<string>('WEBAUTHN_RP_NAME')?.trim() || 'CircleSfera';

  if (isProd) {
    if (!rawRpId || rawRpId === '' || rawRpId.toLowerCase() === 'localhost') {
      throw new Error(
        'WEBAUTHN_RP_ID environment variable is required in production and cannot be localhost',
      );
    }

    if (!rawOrigin || rawOrigin === '') {
      throw new Error(
        'WEBAUTHN_ORIGIN environment variable is required in production',
      );
    }

    const origins = rawOrigin
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      throw new Error(
        'WEBAUTHN_ORIGIN environment variable is required in production',
      );
    }

    for (const origin of origins) {
      if (
        origin.startsWith('http://') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        throw new Error(
          `Insecure WebAuthn origin '${origin}' is forbidden in production; HTTPS required`,
        );
      }
    }

    return {
      rpID: rawRpId,
      rpName,
      origin: origins,
    };
  }

  // Non-production (development, test)
  const devOrigins = rawOrigin
    ? rawOrigin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : DEFAULT_DEV_ORIGIN;

  return {
    rpID: rawRpId || DEFAULT_DEV_RP_ID,
    rpName,
    origin: devOrigins.length > 0 ? devOrigins : DEFAULT_DEV_ORIGIN,
  };
}
