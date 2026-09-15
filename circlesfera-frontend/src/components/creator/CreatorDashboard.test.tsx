import { screen } from '@testing-library/react';
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
  mrr: 0,
  subscriberCount: 0,
  geoDistribution: [],
  activityHours: [],
  retentionStatus: { active: 1, churning: 0, churned: 0 },
  insights: {
    bestDayToPost: 'Tuesday',
    bestHourToPost: 18,
    retentionRate: 72,
  },
};

describe('CreatorDashboard', () => {
  const onPromote = vi.fn();
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [] },
    } as never);
  });

  it('labels chrome from the EN catalog, not hardcoded English fallbacks', async () => {
    const { i18n } = renderWithProviders(
      <CreatorDashboard
        onPromote={onPromote}
        onNavigate={onNavigate}
        stats={stats}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: i18n!.t('creator.dashboard.content_performance'),
      }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(i18n!.t('creator.posts.empty_title')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.dashboard.studio_management')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.dashboard.finance_earnings')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.dashboard.ads_promotions')),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        i18n!.t('creator.dashboard.retention_chart_aria', { rate: 72 }),
      ),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.dashboard.content_performance')).toBe(
      'Content Performance',
    );
    expect(
      screen.queryByText('Rendimiento del Contenido'),
    ).not.toBeInTheDocument();
  });

  it('uses Spanish chrome when locale is es', async () => {
    const { i18n } = renderWithProviders(
      <CreatorDashboard
        onPromote={onPromote}
        onNavigate={onNavigate}
        stats={stats}
      />,
      { lng: 'es' },
    );

    expect(
      await screen.findByRole('heading', {
        name: i18n!.t('creator.dashboard.content_performance'),
      }),
    ).toBeInTheDocument();

    expect(i18n!.t('creator.dashboard.content_performance')).toBe(
      'Rendimiento del Contenido',
    );
    expect(
      await screen.findByText(i18n!.t('creator.posts.empty_title')),
    ).toBeInTheDocument();
    expect(screen.queryByText('Content Performance')).not.toBeInTheDocument();
  });
});
