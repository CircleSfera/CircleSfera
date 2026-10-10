import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { likesApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import LikeButton from './LikeButton';

vi.mock('../services', () => ({
  likesApi: {
    check: vi.fn(),
    toggle: vi.fn(),
  },
}));

/** jsdom cannot run multi-keyframe springs; assert labels without motion. */
vi.mock('framer-motion', () => {
  const pass =
    (tag: 'button' | 'div') =>
    ({
      children,
      animate: _animate,
      initial: _initial,
      exit: _exit,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: Record<string, unknown> & { children?: ReactNode }) =>
      createElement(tag, props, children);

  return {
    motion: {
      button: pass('button'),
      div: pass('div'),
    },
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
  };
});

describe('LikeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(likesApi.check).mockResolvedValue({
      data: { liked: false },
    } as never);
  });

  it('labels the control from the catalog', () => {
    const { i18n } = renderWithProviders(<LikeButton postId="post-1" />);

    expect(i18n!.t('post.actions.like')).not.toBe('post.actions.like');
    expect(i18n!.t('post.actions.unlike')).not.toBe('post.actions.unlike');
    expect(
      screen.getByRole('button', { name: i18n!.t('post.actions.like') }),
    ).toBeInTheDocument();
  });

  it('labels unlike from the catalog when the post is already liked', async () => {
    vi.mocked(likesApi.check).mockResolvedValue({
      data: { liked: true },
    } as never);

    const { i18n } = renderWithProviders(<LikeButton postId="post-1" />);

    expect(
      await screen.findByRole('button', {
        name: i18n!.t('post.actions.unlike'),
      }),
    ).toBeInTheDocument();
    expect(i18n!.t('post.actions.unlike')).toBe('Unlike post');
    expect(
      screen.queryByRole('button', { name: i18n!.t('post.actions.like') }),
    ).not.toBeInTheDocument();
  });

  it('turns on at once and tells the screen, before the server answers', async () => {
    vi.mocked(likesApi.toggle).mockReturnValue(new Promise(() => {}) as never);
    const onToggle = vi.fn();
    renderWithProviders(<LikeButton postId="post-1" onToggle={onToggle} />);
    await waitFor(() => expect(likesApi.check).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole('button', { name: 'Like post' }));

    expect(
      await screen.findByRole('button', { name: 'Unlike post' }),
    ).toBeInTheDocument();
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(likesApi.toggle).toHaveBeenCalledWith('post-1');
  });

  it('goes back when the like cannot be saved', async () => {
    vi.mocked(likesApi.toggle).mockRejectedValue(new Error('offline'));
    const onToggle = vi.fn();
    renderWithProviders(<LikeButton postId="post-1" onToggle={onToggle} />);
    await waitFor(() => expect(likesApi.check).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole('button', { name: 'Like post' }));

    await waitFor(() => expect(onToggle).toHaveBeenLastCalledWith(false));
    expect(
      await screen.findByRole('button', { name: 'Like post' }),
    ).toBeInTheDocument();
  });

  it('follows a like given elsewhere on the screen', async () => {
    const { queryClient } = renderWithProviders(<LikeButton postId="post-1" />);
    await screen.findByRole('button', { name: 'Like post' });
    await waitFor(() =>
      expect(queryClient.getQueryData(['like', 'post-1'])).toBeDefined(),
    );

    act(() =>
      queryClient.setQueryData(['like', 'post-1'], { data: { liked: true } }),
    );

    expect(
      await screen.findByRole('button', { name: 'Unlike post' }),
    ).toBeInTheDocument();
  });
});
