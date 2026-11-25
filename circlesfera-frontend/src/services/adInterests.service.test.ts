import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('./api', () => ({ apiClient: client }));

import { adInterestsApi } from './adInterests.service';

describe('adInterestsApi', () => {
  beforeEach(() => {
    client.get.mockReset().mockResolvedValue({ data: { interests: [] } });
    client.put.mockReset().mockResolvedValue({ data: { interests: [] } });
  });

  it('reads the interests of the session’s own account', async () => {
    await expect(adInterestsApi.status()).resolves.toEqual({ interests: [] });

    expect(client.get).toHaveBeenCalledWith('users/me/ad-interests');
  });

  it('sends the whole set, which replaces the one stored', async () => {
    await adInterestsApi.choose(['music', 'travel']);

    expect(client.put).toHaveBeenCalledWith('users/me/ad-interests', {
      topics: ['music', 'travel'],
    });
  });
});
