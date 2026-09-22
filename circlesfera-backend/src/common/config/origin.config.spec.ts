import { describe, expect, it } from 'vitest';
import {
  createCspDirectives,
  DEFAULT_DEV_ORIGINS,
  deriveWebSocketOrigins,
  isOriginAllowed,
  parseAllowedOrigins,
} from './origin.config.js';

describe('Origin & CSP Hardening Configuration (SEC-014)', () => {
  describe('parseAllowedOrigins', () => {
    it('returns default development origins when CORS_ORIGIN is empty in non-production', () => {
      expect(parseAllowedOrigins(undefined, false)).toEqual(
        expect.arrayContaining(DEFAULT_DEV_ORIGINS as string[]),
      );
      expect(parseAllowedOrigins('', false)).toEqual(
        expect.arrayContaining(DEFAULT_DEV_ORIGINS as string[]),
      );
    });

    it('parses, trims and filters comma-separated origins', () => {
      const input =
        'https://circlesfera.com, https://admin.circlesfera.com , https://app.circlesfera.com';
      const parsed = parseAllowedOrigins(input, true);

      expect(parsed).toEqual([
        'https://circlesfera.com',
        'https://admin.circlesfera.com',
        'https://app.circlesfera.com',
      ]);
    });

    it('throws error in production if CORS_ORIGIN is missing or empty', () => {
      expect(() => parseAllowedOrigins(undefined, true)).toThrowError(
        'CORS_ORIGIN environment variable is required in production',
      );
      expect(() => parseAllowedOrigins('   ', true)).toThrowError(
        'CORS_ORIGIN environment variable is required in production',
      );
    });
  });

  describe('deriveWebSocketOrigins', () => {
    it('converts HTTP and HTTPS origins to WS and WSS counterparts', () => {
      const httpOrigins = [
        'http://localhost:5173',
        'https://circlesfera.com',
        'https://admin.circlesfera.com',
      ];
      const wsOrigins = deriveWebSocketOrigins(httpOrigins);

      expect(wsOrigins).toContain('ws://localhost:5173');
      expect(wsOrigins).toContain('wss://circlesfera.com');
      expect(wsOrigins).toContain('wss://admin.circlesfera.com');
      expect(wsOrigins).toContain('ws://localhost:3000');
    });

    it('does not contain wss://* wildcard', () => {
      const wsOrigins = deriveWebSocketOrigins(['https://circlesfera.com']);
      expect(wsOrigins).not.toContain('wss://*');
    });
  });

  describe('isOriginAllowed', () => {
    const allowed = [
      'https://circlesfera.com',
      'https://admin.circlesfera.com',
      'http://localhost:5173',
    ];

    it('returns true for exact whitelisted origins', () => {
      expect(isOriginAllowed('https://circlesfera.com', allowed)).toBe(true);
      expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
    });

    it('returns false for unauthorized or attacking origins', () => {
      expect(isOriginAllowed('https://evil-hacker.com', allowed)).toBe(false);
      expect(
        isOriginAllowed('https://sub.circlesfera.com.attacker.com', allowed),
      ).toBe(false);
      expect(isOriginAllowed('http://localhost:9999', allowed)).toBe(false);
    });

    it('returns false for undefined or empty origin', () => {
      expect(isOriginAllowed(undefined, allowed)).toBe(false);
      expect(isOriginAllowed('', allowed)).toBe(false);
    });
  });

  describe('createCspDirectives', () => {
    const baseOptions = {
      allowedOrigins: [
        'https://circlesfera.com',
        'https://admin.circlesfera.com',
      ],
      livekitUrl: 'wss://livekit.circlesfera.com',
      cdnUrl: 'https://cdn.circlesfera.com',
      isProd: true,
    };

    it('creates strict policy without unsafe-inline for API routes', () => {
      const directives = createCspDirectives({
        ...baseOptions,
        isSwagger: false,
      });

      expect(directives.defaultSrc).toEqual(["'self'"]);
      expect(directives.scriptSrc).toEqual(["'self'"]);
      expect(directives.scriptSrc).not.toContain("'unsafe-inline'");
      expect(directives.styleSrc).toEqual([
        "'self'",
        'https://fonts.googleapis.com',
      ]);
      expect(directives.styleSrc).not.toContain("'unsafe-inline'");

      // Connect sources must be bounded without wss://*
      expect(directives.connectSrc).toContain("'self'");
      expect(directives.connectSrc).toContain('https://circlesfera.com');
      expect(directives.connectSrc).toContain('wss://circlesfera.com');
      expect(directives.connectSrc).toContain('wss://livekit.circlesfera.com');
      expect(directives.connectSrc).toContain('https://*.sentry.io');
      expect(directives.connectSrc).not.toContain('wss://*');

      // Clickjacking, object, and form hardening
      expect(directives.objectSrc).toEqual(["'none'"]);
      expect(directives.frameAncestors).toEqual(["'none'"]);
      expect(directives.baseUri).toEqual(["'self'"]);
      expect(directives.formAction).toEqual(["'self'"]);
      expect(directives.upgradeInsecureRequests).toEqual([]);
    });

    it('allows unsafe-inline strictly for Swagger UI documentation routes', () => {
      const directives = createCspDirectives({
        ...baseOptions,
        isSwagger: true,
      });

      expect(directives.scriptSrc).toContain("'self'");
      expect(directives.scriptSrc).toContain("'unsafe-inline'");
      expect(directives.styleSrc).toContain("'unsafe-inline'");
      expect(directives.connectSrc).not.toContain('wss://*');
    });

    it('disables upgradeInsecureRequests in development', () => {
      const directives = createCspDirectives({
        allowedOrigins: ['http://localhost:5173'],
        isProd: false,
      });

      expect(directives.upgradeInsecureRequests).toBeNull();
    });
  });
});
