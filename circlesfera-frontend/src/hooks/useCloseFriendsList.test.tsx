import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeFriendsApi, searchApi } from '../services';
import { useCloseFriendsList } from './useCloseFriendsList';

vi.mock('../services', () => ({
  closeFriendsApi: {
    getCloseFriends: vi.fn(),
    toggleCloseFriend: vi.fn(),
  },
  searchApi: {
    searchUsers: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const alice = { id: 'profile-alice', username: 'alice' };
const bob = { id: 'profile-bob', username: 'bob' };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { Wrapper, queryClient };
}

describe('useCloseFriendsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(closeFriendsApi.getCloseFriends).mockResolvedValue({
      data: [alice],
    } as never);
    vi.mocked(closeFriendsApi.toggleCloseFriend).mockResolvedValue({
      data: { isCloseFriend: true },
    } as never);
    vi.mocked(searchApi.searchUsers).mockResolvedValue({
      data: [bob],
    } as never);
  });

  it('loads close friends and exposes their ids', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCloseFriendsList(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.closeFriends).toEqual([alice]);
    });

    expect(result.current.closeFriendsCount).toBe(1);
    expect(result.current.closeFriendIds.has('profile-alice')).toBe(true);
    expect(result.current.displayUsers).toEqual([alice]);
    expect(closeFriendsApi.getCloseFriends).toHaveBeenCalledTimes(1);
  });

  it('does not search until the query is at least two characters', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCloseFriendsList(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.closeFriends).toEqual([alice]);
    });

    act(() => {
      result.current.setSearchTerm('a');
    });

    await waitFor(() => {
      expect(result.current.searchTerm).toBe('a');
    });
    expect(searchApi.searchUsers).not.toHaveBeenCalled();
  });

  it('searches users after debounce and switches the displayed list', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCloseFriendsList(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.closeFriends).toEqual([alice]);
    });

    act(() => {
      result.current.setSearchTerm('bo');
    });

    await waitFor(
      () => {
        expect(searchApi.searchUsers).toHaveBeenCalledWith('bo');
        expect(result.current.displayUsers).toEqual([bob]);
      },
      { timeout: 1500 },
    );
  });

  it('invalidates close friends, stories and feed after a successful toggle', async () => {
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCloseFriendsList(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.closeFriends).toEqual([alice]);
    });

    act(() => {
      result.current.toggleCloseFriend('profile-bob');
    });

    await waitFor(() => {
      expect(closeFriendsApi.toggleCloseFriend).toHaveBeenCalledWith(
        'profile-bob',
      );
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['closeFriends'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stories'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feed'] });
    });
  });

  it('toasts when toggle fails', async () => {
    vi.mocked(closeFriendsApi.toggleCloseFriend).mockRejectedValueOnce(
      new Error('fail'),
    );

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCloseFriendsList(), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.closeFriends).toEqual([alice]);
    });

    act(() => {
      result.current.toggleCloseFriend('profile-bob');
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
