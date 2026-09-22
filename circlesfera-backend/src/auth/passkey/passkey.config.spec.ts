import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEV_ORIGIN,
  DEFAULT_DEV_RP_ID,
  getAssurancePolicy,
  parseWebAuthnConfig,
} from './passkey.config.js';

describe('Passkey Configuration and Assurance Policy (SEC-006 / SEC-007)', () => {
  describe('getAssurancePolicy', () => {
    it('returns preferred user verification for standard sensitivity (SEC-006)', () => {
      const policy = getAssurancePolicy('standard');
      expect(policy.userVerification).toBe('preferred');
      expect(policy.requireUserVerification).toBe(false);
    });

    it('returns required user verification for sensitive operations (SEC-006)', () => {
      const policy = getAssurancePolicy('sensitive');
      expect(policy.userVerification).toBe('required');
      expect(policy.requireUserVerification).toBe(true);
    });

    it('defaults to standard policy when sensitivity is undefined', () => {
      const policy = getAssurancePolicy(undefined);
      expect(policy.userVerification).toBe('preferred');
      expect(policy.requireUserVerification).toBe(false);
    });
  });

  describe('parseWebAuthnConfig', () => {
    describe('Development / Non-Production Environment', () => {
      it('falls back to safe localhost defaults when environment variables are unset', () => {
        const config = parseWebAuthnConfig({
          get: (key: string) => {
            if (key === 'NODE_ENV') return 'development';
            return undefined;
          },
        });

        expect(config.rpID).toBe(DEFAULT_DEV_RP_ID);
        expect(config.rpName).toBe('CircleSfera');
        expect(config.origin).toEqual(DEFAULT_DEV_ORIGIN);
      });

      it('parses custom RP ID and comma-separated development origins', () => {
        const config = parseWebAuthnConfig({
          get: (key: string) => {
            if (key === 'NODE_ENV') return 'development';
            if (key === 'WEBAUTHN_RP_ID') return 'dev.circlesfera.local';
            if (key === 'WEBAUTHN_ORIGIN')
              return 'http://localhost:5173, http://127.0.0.1:5173';
            if (key === 'WEBAUTHN_RP_NAME') return 'CircleSfera Dev';
            return undefined;
          },
        });

        expect(config.rpID).toBe('dev.circlesfera.local');
        expect(config.rpName).toBe('CircleSfera Dev');
        expect(config.origin).toEqual([
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ]);
      });
    });

    describe('Production Environment (SEC-007 Fail-Closed Policy)', () => {
      const validProdEnv: Record<string, string> = {
        NODE_ENV: 'production',
        WEBAUTHN_RP_ID: 'circlesfera.com',
        WEBAUTHN_ORIGIN: 'https://circlesfera.com,https://app.circlesfera.com',
        WEBAUTHN_RP_NAME: 'CircleSfera Production',
      };

      it('successfully parses valid production configuration with HTTPS origins', () => {
        const config = parseWebAuthnConfig({
          get: (key: string) => validProdEnv[key],
        });

        expect(config.rpID).toBe('circlesfera.com');
        expect(config.rpName).toBe('CircleSfera Production');
        expect(config.origin).toEqual([
          'https://circlesfera.com',
          'https://app.circlesfera.com',
        ]);
      });

      it('throws error in production if WEBAUTHN_RP_ID is missing or empty', () => {
        expect(() =>
          parseWebAuthnConfig({
            get: (key: string) => {
              if (key === 'NODE_ENV') return 'production';
              if (key === 'WEBAUTHN_ORIGIN') return 'https://circlesfera.com';
              return undefined;
            },
          }),
        ).toThrow(
          'WEBAUTHN_RP_ID environment variable is required in production and cannot be localhost',
        );
      });

      it('throws error in production if WEBAUTHN_RP_ID is set to localhost', () => {
        expect(() =>
          parseWebAuthnConfig({
            get: (key: string) => {
              if (key === 'NODE_ENV') return 'production';
              if (key === 'WEBAUTHN_RP_ID') return 'localhost';
              if (key === 'WEBAUTHN_ORIGIN') return 'https://circlesfera.com';
              return undefined;
            },
          }),
        ).toThrow(
          'WEBAUTHN_RP_ID environment variable is required in production and cannot be localhost',
        );
      });

      it('throws error in production if WEBAUTHN_ORIGIN is missing or empty', () => {
        expect(() =>
          parseWebAuthnConfig({
            get: (key: string) => {
              if (key === 'NODE_ENV') return 'production';
              if (key === 'WEBAUTHN_RP_ID') return 'circlesfera.com';
              return undefined;
            },
          }),
        ).toThrow(
          'WEBAUTHN_ORIGIN environment variable is required in production',
        );
      });

      it('throws error in production if any origin uses HTTP protocol', () => {
        expect(() =>
          parseWebAuthnConfig({
            get: (key: string) => {
              if (key === 'NODE_ENV') return 'production';
              if (key === 'WEBAUTHN_RP_ID') return 'circlesfera.com';
              if (key === 'WEBAUTHN_ORIGIN') return 'http://circlesfera.com';
              return undefined;
            },
          }),
        ).toThrow(
          "Insecure WebAuthn origin 'http://circlesfera.com' is forbidden in production; HTTPS required",
        );
      });

      it('throws error in production if any origin targets localhost or 127.0.0.1', () => {
        expect(() =>
          parseWebAuthnConfig({
            get: (key: string) => {
              if (key === 'NODE_ENV') return 'production';
              if (key === 'WEBAUTHN_RP_ID') return 'circlesfera.com';
              if (key === 'WEBAUTHN_ORIGIN')
                return 'https://circlesfera.com,https://localhost:5173';
              return undefined;
            },
          }),
        ).toThrow(
          "Insecure WebAuthn origin 'https://localhost:5173' is forbidden in production; HTTPS required",
        );
      });
    });
  });
});
