import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorStats } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorDashboard from './CreatorDashboard';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getPosts: vi.fn(),
  },
}));

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: {
    getMonetization: vi.fn().mockResolvedValue({ lifetimeEarningsCents: 1250 }),
  },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: unknown }) => unknown) =>
    selector({
      profile: {
        user: { verificationLevel: 'CREATOR' },
      },
    }),
}));

const stats: CreatorStats = {
  postCount: 0,
  frameCount: 0,
  storyCount: 0,
  followerCount: 10,
  followingCount: 2,
  totalLikes: 0,
  totalComments: 0,
  totalBookmarks: 0,
  activePromotions: 0,
  engagementRate: 4.2,
  followerGrowth: 3,
  totalReach: 1200,
  geoDistribution: [],
  activityHours: [],
  insights: {
    bestDayToPost: 'TUESDAY',
    bestHourToPost: 18,
    retentionRate: 72,
  },
};

const post = {
  id: 'p1',
  caption: 'First light',
  type: 'POST',
  views: 1200,
  performanceScore: 111,
  createdAt: '2026-01-01T00:00:00.000Z',
  _count: { likes: 3, comments: 1, bookmarks: 0 },
};

describe('CreatorDashboard', () => {
  const onPromote = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [] },
    } as never);
  });

  it('shows the four figures the server measures, each saying what it is', async () => {
    renderWithProviders(
      <CreatorDashboard onPromote={onPromote} stats={stats} />,
    );

    expect(screen.getByText('Followers')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('+3% in 7 days')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('Views of posts and stories')).toBeInTheDocument();
    expect(screen.getByText('4.2 %')).toBeInTheDocument();
    expect(await screen.findByText('€12.50')).toBeInTheDocument();
  });

  it('leaves out the monthly income and the subscribers, which nothing measures', () => {
    renderWithProviders(
      <CreatorDashboard onPromote={onPromote} stats={stats} />,
    );

    expect(screen.queryByText(/mrr/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/subscribers/i)).not.toBeInTheDocument();
  });

  it('says there are not enough days instead of drawing a chart of two points', () => {
    renderWithProviders(
      <CreatorDashboard
        onPromote={onPromote}
        stats={stats}
        chartData={[
          { date: '2026-01-01', views: 1, followers: 1, reach: 1 },
          { date: '2026-01-02', views: 2, followers: 1, reach: 1 },
        ]}
      />,
    );

    expect(
      screen.getByText('There are not enough days yet to draw the trend.'),
    ).toBeInTheDocument();
  });

  it('hides the best day and hour while the profile has no likes', () => {
    renderWithProviders(
      <CreatorDashboard onPromote={onPromote} stats={stats} />,
    );

    expect(screen.getByText('Active followers')).toBeInTheDocument();
    expect(screen.getByText('72 %')).toBeInTheDocument();
    expect(screen.queryByText('Best day')).not.toBeInTheDocument();
    expect(screen.queryByText('Most active hour')).not.toBeInTheDocument();
  });

  it('writes the best day in the language of the reader', () => {
    renderWithProviders(
      <CreatorDashboard
        onPromote={onPromote}
        stats={{ ...stats, totalLikes: 5 }}
      />,
    );

    expect(screen.getByText('Best day')).toBeInTheDocument();
    expect(screen.getByText('Tuesday')).toBeInTheDocument();
    expect(screen.queryByText('TUESDAY')).not.toBeInTheDocument();
  });

  it('lists the latest posts in words and promotes one from its row', async () => {
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [post] },
    } as never);
    renderWithProviders(
      <CreatorDashboard onPromote={onPromote} stats={stats} />,
    );

    expect(await screen.findByText('First light')).toBeInTheDocument();
    expect(
      screen.getByText('1,200 views · 3 likes · 1 comment'),
    ).toBeInTheDocument();
    expect(screen.getByText('11% above your average')).toBeInTheDocument();
    expect(screen.queryByText('POST')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see all/i })).toHaveAttribute(
      'href',
      '/creator/content',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Promote: First light' }),
    );
    expect(onPromote).toHaveBeenCalledWith(post);
  });

  it('says what will appear when there is no post yet, in Spanish too', async () => {
    const { i18n } = renderWithProviders(
      <CreatorDashboard onPromote={onPromote} stats={stats} />,
      { lng: 'es' },
    );

    expect(
      await screen.findByText(i18n!.t('creator.posts.empty_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Últimas publicaciones' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ver todas/i })).toBeNull();
  });
});
