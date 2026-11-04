import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postsApi } from '../services';
import { createTestQueryClient } from '../test/test-utils';
import type { Post } from '../types';
import { usePostInteractionSettings } from './usePostInteractionSettings';

vi.mock('../services', () => ({
  postsApi: { setInteractions: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const post = (over: Partial<Post> = {}) =>
  ({ id: 'post-1', turnOffComments: false, hideLikes: false, ...over }) as Post;

function setup(target: Post | undefined) {
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    invalidate,
    ...renderHook(() => usePostInteractionSettings(target), { wrapper }),
  };
}

describe('usePostInteractionSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('turns comments off, says so and refreshes the lists that show the post', async () => {
    vi.mocked(postsApi.setInteractions).mockResolvedValue({} as never);
    const { result, invalidate } = setup(post());

    expect(result.current.commentsOff).toBe(false);
    act(() => result.current.toggleComments());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Commenting turned off'),
    );
    expect(postsApi.setInteractions).toHaveBeenCalledWith('post-1', {
      turnOffComments: true,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['frames'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['comments', 'post-1'],
    });
  });

  it.each([
    [
      { turnOffComments: true },
      'toggleComments',
      { turnOffComments: false },
      'Commenting turned on',
    ],
    [{}, 'toggleLikes', { hideLikes: true }, 'Like count hidden'],
    [
      { hideLikes: true },
      'toggleLikes',
      { hideLikes: false },
      'Like count shown',
    ],
  ] as const)('from %o, %s sends %o', async (start, action, sent, message) => {
    vi.mocked(postsApi.setInteractions).mockResolvedValue({} as never);
    const { result } = setup(post(start));

    act(() => result.current[action]());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(message));
    expect(postsApi.setInteractions).toHaveBeenCalledWith('post-1', sent);
  });

  it('says when the change could not be saved', async () => {
    vi.mocked(postsApi.setInteractions).mockRejectedValue(new Error('down'));
    const { result } = setup(post());

    act(() => result.current.toggleLikes());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not save the change. Try again.',
      ),
    );
  });

  it('does nothing while there is no post yet', () => {
    const { result } = setup(undefined);

    act(() => {
      result.current.toggleComments();
      result.current.toggleLikes();
    });

    expect(result.current.commentsOff).toBe(false);
    expect(result.current.likesHidden).toBe(false);
    expect(postsApi.setInteractions).not.toHaveBeenCalled();
  });
});
