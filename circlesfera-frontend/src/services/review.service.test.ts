import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api';
import { reviewApi } from './review.service';

vi.mock('./api', () => ({ apiClient: { get: vi.fn() } }));

describe('the review area client', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset().mockResolvedValue({ data: 'payload' });
  });

  it('asks for each page of the review area, read only', async () => {
    await reviewApi.summary();
    await reviewApi.paidContent({ kind: 'story', page: 2, limit: 10 });
    await reviewApi.creators({ page: 3 });
    await reviewApi.enforcement({ kind: 'strikes', page: 1 });

    expect(apiClient.get).toHaveBeenNthCalledWith(1, 'admin/review/summary');
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      'admin/review/paid-content',
      { params: { kind: 'story', page: 2, limit: 10 } },
    );
    expect(apiClient.get).toHaveBeenNthCalledWith(3, 'admin/review/creators', {
      params: { page: 3 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(
      4,
      'admin/review/enforcement',
      { params: { kind: 'strikes', page: 1 } },
    );
  });
});
