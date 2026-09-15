import { screen } from '@testing-library/react';
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

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: unknown }) => unknown) =>
    selector({
      profile: {
        user: { verificationLevel: 'ELITE' },
      },
    }),
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

  it('uses Spanish empty chrome and post actions from the catalog', async () => {
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

    expect(
      await screen.findByText(i18n!.t('creator.dashboard.untitled_post')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('creator.posts.insights') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('creator.posts.boost') }),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.posts.boost')).toBe('Impulsar');
    expect(screen.queryByText('Boost')).not.toBeInTheDocument();
  });
});
