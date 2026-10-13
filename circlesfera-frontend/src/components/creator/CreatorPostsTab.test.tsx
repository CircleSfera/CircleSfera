import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorPostsTab from './CreatorPostsTab';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getPosts: vi.fn(),
  },
}));

const post: CreatorPost = {
  id: 'post-1',
  caption: null,
  type: 'POST',
  views: 42,
  performanceScore: 55,
  createdAt: '2026-01-01T00:00:00.000Z',
  _count: { likes: 3, comments: 1, bookmarks: 0 },
};

describe('CreatorPostsTab', () => {
  const onPromote = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('labels filters and empty state from the EN catalog', async () => {
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } },
    } as never);

    const { i18n } = renderWithProviders(
      <CreatorPostsTab onPromote={onPromote} />,
    );

    expect(
      await screen.findByText(i18n!.t('creator.posts.empty_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('creator.posts.filter_all') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('creator.posts.filter_posts'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('creator.posts.filter_frames'),
      }),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.posts.empty_title')).toBe('No posts yet');
    expect(
      screen.queryByText('Aún no tienes publicaciones'),
    ).not.toBeInTheDocument();
  });

  it('writes a post in words in Spanish, with its statistics and one action', async () => {
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: {
        data: [post],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      },
    } as never);

    const { i18n } = renderWithProviders(
      <CreatorPostsTab onPromote={onPromote} />,
      { lng: 'es' },
    );

    const title = i18n!.t('creator.post.untitled');
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Estadísticas de: ${title}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Promocionar: ${title}` }),
    ).toBeInTheDocument();
    expect(screen.queryByText('POST')).not.toBeInTheDocument();
    expect(screen.queryByText(/insights|performance/i)).not.toBeInTheDocument();
  });

  it('lets a creator promote a post without any paid plan', async () => {
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: {
        data: [post],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      },
    } as never);

    renderWithProviders(<CreatorPostsTab onPromote={onPromote} />);

    fireEvent.click(await screen.findByRole('button', { name: /^Promote: / }));

    expect(onPromote).toHaveBeenCalledWith(post);
  });

  it('asks the server for one kind and goes back to the first page', async () => {
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: {
        data: [post],
        meta: { total: 30, page: 1, limit: 10, totalPages: 3 },
      },
    } as never);

    renderWithProviders(<CreatorPostsTab onPromote={onPromote} />);

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(creatorApi.getPosts).toHaveBeenLastCalledWith(2, 10, undefined),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Frames' }));
    await waitFor(() =>
      expect(creatorApi.getPosts).toHaveBeenLastCalledWith(1, 10, 'FRAME'),
    );
  });
});
