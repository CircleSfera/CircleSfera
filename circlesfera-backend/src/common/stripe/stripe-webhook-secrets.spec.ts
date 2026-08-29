import { describe, expect, it } from 'vitest';
import { stripeWebhookSecrets } from './stripe-webhook-secrets.js';

describe('stripeWebhookSecrets', () => {
  it('returns the platform secret first', () => {
    expect(
      stripeWebhookSecrets({
        platform: 'whsec_platform',
        connect: 'whsec_connect',
      }),
    ).toEqual(['whsec_platform', 'whsec_connect']);
  });

  it('omits a missing or placeholder Connect secret', () => {
    expect(
      stripeWebhookSecrets({
        platform: 'whsec_platform',
        connect: 'whsec_CHANGE_ME',
      }),
    ).toEqual(['whsec_platform']);
    expect(stripeWebhookSecrets({ platform: 'whsec_platform' })).toEqual([
      'whsec_platform',
    ]);
  });

  it('returns empty when the platform secret is missing or a placeholder', () => {
    expect(stripeWebhookSecrets({ platform: 'whsec_dummy' })).toEqual([]);
    expect(stripeWebhookSecrets({})).toEqual([]);
  });
});
