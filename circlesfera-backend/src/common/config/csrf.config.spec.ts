import { describe, expect, it } from 'vitest';
import { isCsrfExempt } from './csrf.config.js';

describe('isCsrfExempt', () => {
  it("lets Slack's commands and button clicks in without a CSRF token", () => {
    expect(isCsrfExempt('/api/v1/slack/commands')).toBe(true);
    expect(isCsrfExempt('/api/v1/slack/interactions')).toBe(true);
  });

  it('exempts no other Slack route, nor one that only contains their path', () => {
    expect(isCsrfExempt('/api/v1/slack')).toBe(false);
    expect(isCsrfExempt('/api/v1/slack/other')).toBe(false);
    expect(isCsrfExempt('/api/v1/posts/api/v1/slack/commands')).toBe(false);
  });

  it('keeps the routes exempted before', () => {
    for (const path of [
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/refresh',
      '/api/v1/auth/verify-email',
      '/api/v1/auth/request-reset',
      '/api/v1/auth/reset-password',
      '/api/v1/auth/passkey/login-options',
      '/api/v1/auth/passkey/login-verify',
      '/api/v1/admin-auth/login',
      '/api/v1/admin-auth/mfa/verify',
      '/api/v1/admin-auth/refresh',
      '/api/v1/csrf-token',
      '/api/v1/payments/webhook',
      '/api/v1/security/csp-report',
      '/api/v1/helpdesk/inbound/email',
      '/api/v1/newsletter/unsubscribe',
      '/socket.io',
    ]) {
      expect(isCsrfExempt(path)).toBe(true);
    }
  });

  it('asks every other route for a token', () => {
    expect(isCsrfExempt('/api/v1/posts')).toBe(false);
    expect(isCsrfExempt('/api/v1/monetization/connect/onboarding')).toBe(false);
  });
});
