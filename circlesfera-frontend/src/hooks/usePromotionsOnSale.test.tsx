import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorApi } from '../services/creator.service';
import { useAuthStore } from '../stores/authStore';
import { createTestQueryClient } from '../test/test-utils';
import { usePromotionsOnSale } from './usePromotionsOnSale';

const web = vi.hoisted(() => ({ value: true }));
vi.mock('../utils/sellsInApp', () => ({ sellsInApp: () => web.value }));
vi.mock('../services/creator.service', () => ({
  creatorApi: { getPromotionsOnSale: vi.fn() },
}));

const as = (accountType: string) =>
  useAuthStore.setState({ profile: { id: 'p1', accountType } as never });

const run = () => {
  const client = createTestQueryClient();
  return renderHook(() => usePromotionsOnSale(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

describe('whether a promotion may be bought', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    web.value = true;
    vi.mocked(creatorApi.getPromotionsOnSale).mockResolvedValue({
      data: { onSale: true },
    } as never);
  });

  it('is so for a Creator or Business Profile on the web while promotions are on sale', async () => {
    as('BUSINESS');
    const { result } = run();
    expect(result.current).toBe(false); // nothing offered until the server answers
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is not while promotions are not on sale', async () => {
    as('CREATOR');
    vi.mocked(creatorApi.getPromotionsOnSale).mockResolvedValue({
      data: { onSale: false },
    } as never);
    const { result } = run();
    await waitFor(() =>
      expect(creatorApi.getPromotionsOnSale).toHaveBeenCalled(),
    );
    expect(result.current).toBe(false);
  });

  it('never asks for a personal Profile, nor in the apps', () => {
    as('PERSONAL');
    expect(run().result.current).toBe(false);
    as('CREATOR');
    web.value = false;
    expect(run().result.current).toBe(false);
    expect(creatorApi.getPromotionsOnSale).not.toHaveBeenCalled();
  });
});
