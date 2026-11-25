import { AD_CONSENT_TEXT_VERSION } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('./api', () => ({ apiClient: client }));

import { adsConsentApi } from './adsConsent.service';

describe('adsConsentApi', () => {
  beforeEach(() => {
    client.get.mockReset().mockResolvedValue({ data: { askNow: false } });
    client.put.mockReset().mockResolvedValue({ data: { askNow: false } });
  });

  it('asks with the version of the texts this build carries, so an older build is not asked', async () => {
    await expect(adsConsentApi.status()).resolves.toEqual({ askNow: false });

    expect(client.get).toHaveBeenCalledWith('users/me/ads-consent', {
      params: { textVersion: AD_CONSENT_TEXT_VERSION },
    });
  });

  it('answers with the texts shown and the language they were shown in', async () => {
    await adsConsentApi.answer('GENERAL', 'SETTINGS', 'es-ES');

    expect(client.put).toHaveBeenCalledWith('users/me/ads-consent', {
      choice: 'GENERAL',
      source: 'SETTINGS',
      textVersion: AD_CONSENT_TEXT_VERSION,
      locale: 'es',
    });
  });
});
