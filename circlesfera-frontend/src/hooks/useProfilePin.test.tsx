import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collaborationsApi, postsApi } from '../services';
import { useAuthStore } from '../stores/authStore';
import { createTestQueryClient } from '../test/test-utils';
import type { Post } from '../types';
import { useProfilePin } from './useProfilePin';

vi.mock('../services', () => ({
  postsApi: { pinToProfile: vi.fn(), unpinFromProfile: vi.fn() },
  collaborationsApi: { pin: vi.fn(), unpin: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const post = (over: Partial<Post> = {}) =>
  ({ id: 'post-1', pinnedToProfileAt: null, ...over }) as Post;

function setup(target: Post | undefined) {
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    invalidate,
    ...renderHook(() => useProfilePin(target), { wrapper }),
  };
}

describe('useProfilePin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ profile: { id: 'author-1' } as never });
  });

  describe('as the collaborator', () => {
    const coAuthored = (pinnedAt: string | null) =>
      post({
        // The author's own pin, on the author's profile.
        pinnedToProfileAt: '2026-11-01',
        collaborator: { id: 'me', pinnedAt } as never,
      });

    beforeEach(() => {
      useAuthStore.setState({ profile: { id: 'me' } as never });
    });

    it('pins it on its own profile through the collaboration', async () => {
      vi.mocked(collaborationsApi.pin).mockResolvedValue({} as never);
      const { result } = setup(coAuthored(null));

      // Not pinned here, whatever the author did.
      expect(result.current.pinned).toBe(false);
      act(() => result.current.togglePin());

      await waitFor(() =>
        expect(collaborationsApi.pin).toHaveBeenCalledWith('post-1'),
      );
      expect(postsApi.pinToProfile).not.toHaveBeenCalled();
    });

    it('unpins its own pin', async () => {
      vi.mocked(collaborationsApi.unpin).mockResolvedValue({} as never);
      const { result } = setup(coAuthored('2026-11-05'));

      expect(result.current.pinned).toBe(true);
      act(() => result.current.togglePin());

      await waitFor(() =>
        expect(collaborationsApi.unpin).toHaveBeenCalledWith('post-1'),
      );
      expect(postsApi.unpinFromProfile).not.toHaveBeenCalled();
    });
  });

  it('pins a post, says so and refreshes the profile lists', async () => {
    vi.mocked(postsApi.pinToProfile).mockResolvedValue({} as never);
    const { result, invalidate } = setup(post());

    expect(result.current.pinned).toBe(false);
    act(() => result.current.togglePin());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Pinned to your profile'),
    );
    expect(postsApi.pinToProfile).toHaveBeenCalledWith('post-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['userPosts'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['userFrames'] });
  });

  it('unpins a pinned one', async () => {
    vi.mocked(postsApi.unpinFromProfile).mockResolvedValue({} as never);
    const { result } = setup(post({ pinnedToProfileAt: '2026-11-09' }));

    expect(result.current.pinned).toBe(true);
    act(() => result.current.togglePin());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Unpinned from your profile'),
    );
    expect(postsApi.unpinFromProfile).toHaveBeenCalledWith('post-1');
  });

  it('tells the author to unpin one first when three are pinned', async () => {
    vi.mocked(postsApi.pinToProfile).mockRejectedValue({
      data: { errorCode: 'PROFILE_PINS_FULL' },
    });
    const { result } = setup(post());

    act(() => result.current.togglePin());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'You can pin up to 3. Unpin one first.',
      ),
    );
  });

  it('says a pin failed for any other reason', async () => {
    vi.mocked(postsApi.pinToProfile).mockRejectedValue(new Error('down'));
    const { result } = setup(post());

    act(() => result.current.togglePin());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not change the pin. Try again.',
      ),
    );
  });

  it('does nothing without a post', () => {
    const { result } = setup(undefined);
    act(() => result.current.togglePin());
    expect(postsApi.pinToProfile).not.toHaveBeenCalled();
  });
});
