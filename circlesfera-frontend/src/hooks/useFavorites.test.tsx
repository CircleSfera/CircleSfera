import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { favoritesApi } from '../services';
import { createTestQueryClient } from '../test/test-utils';
import { useFavorites } from './useFavorites';

vi.mock('../services', () => ({
  favoritesApi: { list: vi.fn(), add: vi.fn(), remove: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

function setup(enabled = true) {
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    invalidate,
    ...renderHook(() => useFavorites(enabled), { wrapper }),
  };
}

describe('useFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(favoritesApi.list).mockResolvedValue({
      data: [{ id: 'fav-1', username: 'ana', addedAt: '2026-11-09' }],
    } as never);
  });

  it('knows which Profiles are Favorites', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.isFavorite('fav-1')).toBe(true));
    expect(result.current.isFavorite('other')).toBe(false);
    expect(result.current.max).toBe(50);
  });

  it('does not ask while disabled', () => {
    setup(false);
    expect(favoritesApi.list).not.toHaveBeenCalled();
  });

  it('adds one, says so and refreshes the list and the Favorites feed', async () => {
    vi.mocked(favoritesApi.add).mockResolvedValue({} as never);
    const { result, invalidate } = setup();
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));

    act(() => result.current.toggle('other'));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Added to Favorites'),
    );
    expect(favoritesApi.add).toHaveBeenCalledWith('other');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['favorites'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['feed', 'favorites'],
    });
  });

  it('removes one that is a Favorite', async () => {
    vi.mocked(favoritesApi.remove).mockResolvedValue({} as never);
    const { result } = setup();
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));

    act(() => result.current.toggle('fav-1'));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Removed from Favorites'),
    );
    expect(favoritesApi.remove).toHaveBeenCalledWith('fav-1');
  });

  it.each([
    ['FAVORITES_FULL', 'You can have up to 50 Favorites. Remove one first.'],
    ['FAVORITE_NOT_FOLLOWED', 'Only Profiles you follow can be Favorites.'],
    [undefined, 'Could not change your Favorites. Try again.'],
  ])('explains a refusal (%s)', async (errorCode, message) => {
    vi.mocked(favoritesApi.add).mockRejectedValue({ data: { errorCode } });
    const { result } = setup();
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));

    act(() => result.current.toggle('other'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
  });
});
