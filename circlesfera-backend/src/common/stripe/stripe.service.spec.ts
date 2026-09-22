import { describe, expect, it } from 'vitest';
import { deriveConnectAccountFlags } from './stripe.service.js';

describe('deriveConnectAccountFlags', () => {
  // Single source of truth shared by monetization.service.ts's on-demand
  // getAccountStatus poll and payments.service.ts's account.updated webhook.
  it('enables both flags when transfers are active and charges are enabled', () => {
    expect(
      deriveConnectAccountFlags({
        charges_enabled: true,
        capabilities: { transfers: 'active' },
      }),
    ).toEqual({ transfersEnabled: true, chargesEnabled: true });
  });

  it('disables transfersEnabled for any non-active capability state', () => {
    expect(
      deriveConnectAccountFlags({
        charges_enabled: true,
        capabilities: { transfers: 'pending' },
      }),
    ).toEqual({ transfersEnabled: false, chargesEnabled: true });
  });

  it('handles a missing capabilities object or charges_enabled field', () => {
    expect(deriveConnectAccountFlags({})).toEqual({
      transfersEnabled: false,
      chargesEnabled: false,
    });
    expect(
      deriveConnectAccountFlags({ capabilities: null, charges_enabled: null }),
    ).toEqual({ transfersEnabled: false, chargesEnabled: false });
  });
});
