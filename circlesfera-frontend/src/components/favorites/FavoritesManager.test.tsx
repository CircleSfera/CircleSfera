import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { favoritesApi, followsApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import FavoritesManager from './FavoritesManager';

vi.mock('../../services', () => ({
  favoritesApi: { list: vi.fn(), add: vi.fn(), remove: vi.fn() },
  followsApi: { getFollowing: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('FavoritesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ profile: { username: 'me' } as never });
    vi.mocked(favoritesApi.list).mockResolvedValue({
      data: [{ id: 'fav-1', username: 'ana', addedAt: '2026-11-09' }],
    } as never);
    vi.mocked(followsApi.getFollowing).mockResolvedValue({
      data: {
        data: [
          { id: 'fav-1', username: 'ana' },
          { id: 'p-2', username: 'bea' },
        ],
        nextCursor: 'next',
      },
    } as never);
  });

  it('lists the Favorites with their count, then the rest of whom one follows', async () => {
    renderWithProviders(<FavoritesManager />);

    expect(await screen.findByText('1 of 50')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: 'Remove ana from Favorites',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      await screen.findByRole('button', { name: 'Add bea to Favorites' }),
    ).toHaveAttribute('aria-pressed', 'false');
    // A Favorite is not listed twice.
    expect(screen.getAllByText('ana')).toHaveLength(1);
    expect(followsApi.getFollowing).toHaveBeenCalledWith('me', undefined, 30);
  });

  it('adds one of those one follows, and loads more of them', async () => {
    vi.mocked(favoritesApi.add).mockResolvedValue({} as never);
    renderWithProviders(<FavoritesManager />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add bea to Favorites' }),
    );
    await waitFor(() => expect(favoritesApi.add).toHaveBeenCalledWith('p-2'));

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() =>
      expect(followsApi.getFollowing).toHaveBeenCalledWith('me', 'next', 30),
    );
  });
});
