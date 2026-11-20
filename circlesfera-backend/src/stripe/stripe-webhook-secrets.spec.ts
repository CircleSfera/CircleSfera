import { describe, expect, it } from 'vitest';
import { usableWebhookSecret } from './stripe-webhook-secrets.js';

describe('usableWebhookSecret', () => {
  it('returns a real secret as it is', () => {
    expect(usableWebhookSecret('whsec_platform')).toBe('whsec_platform');
  });

  it('returns none for a missing or placeholder secret', () => {
    expect(usableWebhookSecret('whsec_dummy')).toBeNull();
    expect(usableWebhookSecret('whsec_CHANGE_ME')).toBeNull();
    expect(usableWebhookSecret(undefined)).toBeNull();
    expect(usableWebhookSecret('')).toBeNull();
  });
});
