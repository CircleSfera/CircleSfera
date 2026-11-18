import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api';
import { businessStatsApi, recordBusinessVisit } from './businessStats.service';

vi.mock('./api', () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

describe('the business statistics service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a visit once per tab, and ignores a failure', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('offline'));
    recordBusinessVisit('p-1');
    recordBusinessVisit('p-1');
    recordBusinessVisit('p-2');
    expect(apiClient.post).toHaveBeenCalledTimes(2);
    expect(apiClient.post).toHaveBeenCalledWith('business-stats/p-1/events', {
      kind: 'visit',
    });
    await expect(
      businessStatsApi.record('p-1', 'call'),
    ).resolves.toBeUndefined();
  });

  it('reads the statistics for a number of days', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { days: 7 } });
    await expect(businessStatsApi.read(7)).resolves.toEqual({ days: 7 });
    expect(apiClient.get).toHaveBeenCalledWith('business-stats', {
      params: { days: 7 },
    });
  });
});
