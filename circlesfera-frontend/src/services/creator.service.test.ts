import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  apiClient: { post: vi.fn().mockResolvedValue({ data: {} }) },
}));

import { apiClient } from './api';
import { creatorApi } from './creator.service';

describe('creatorApi.trackFrameWatch', () => {
  beforeEach(() => vi.mocked(apiClient.post).mockClear());

  it('sends watch time in the query string without a JSON null body', async () => {
    await creatorApi.trackFrameWatch('post-1', 4.5);

    expect(apiClient.post).toHaveBeenCalledWith(
      'analytics/post/post-1/watch',
      undefined,
      { params: { seconds: 4.5 } },
    );
  });
});
