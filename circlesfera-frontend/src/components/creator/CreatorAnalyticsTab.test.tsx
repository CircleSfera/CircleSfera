import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorStats } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { monetizationApi } from '../../services/monetization.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorAnalyticsTab from './CreatorAnalyticsTab';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getStats: vi.fn(),
    getActivityChart: vi.fn(),
    exportAnalyticsCsv: vi.fn(),
  },
}));

const auth = vi.hoisted(() => ({ verificationLevel: 'BASIC' }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (
    selector: (s: { profile: { verificationLevel: string } }) => unknown,
  ) => selector({ profile: { verificationLevel: auth.verificationLevel } }),
}));

vi.mock('./CreatorAnalyticsDashboard', () => ({
  CreatorAnalyticsDashboard: () => <div data-testid="advanced-analytics" />,
}));

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: {
    getIncomeStats: vi.fn(),
    getFinancialSummary: vi.fn(),
  },
}));

const emptyStats: CreatorStats = {
  postCount: 0,
  frameCount: 0,
  storyCount: 0,
  followerCount: 0,
  followingCount: 0,
  totalLikes: 0,
  totalComments: 0,
  totalBookmarks: 0,
  activePromotions: 0,
  engagementRate: 0,
  followerGrowth: 0,
  totalReach: 0,
  geoDistribution: [],
  activityHours: [],
  insights: {
    bestDayToPost: null,
    bestHourToPost: 0,
    retentionRate: 0,
  },
};

describe('CreatorAnalyticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getStats).mockResolvedValue({
      data: emptyStats,
    } as never);
    vi.mocked(creatorApi.getActivityChart).mockResolvedValue({
      data: [],
    } as never);
    vi.mocked(monetizationApi.getIncomeStats).mockResolvedValue([]);
    vi.mocked(monetizationApi.getFinancialSummary).mockResolvedValue({
      currentMonthIncome: 0,
      totalTips: 0,
    } as never);
  });

  it.each(['BASIC', 'VERIFIED'])(
    'points a creator on the %s level to the plans instead of the advanced analytics',
    async (level) => {
      auth.verificationLevel = level;
      const { i18n } = renderWithProviders(<CreatorAnalyticsTab />);

      expect(
        await screen.findByRole('link', {
          name: i18n!.t('creator.advanced.plan_cta'),
        }),
      ).toHaveAttribute('href', '/pricing');
      expect(
        screen.queryByTestId('advanced-analytics'),
      ).not.toBeInTheDocument();
    },
  );

  it.each(['ELITE', 'BUSINESS'])(
    'shows the advanced analytics to a creator on the %s plan',
    async (level) => {
      auth.verificationLevel = level;
      const { i18n } = renderWithProviders(<CreatorAnalyticsTab />);

      expect(
        await screen.findByTestId('advanced-analytics'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', {
          name: i18n!.t('creator.advanced.plan_cta'),
        }),
      ).not.toBeInTheDocument();
    },
  );

  it('shows the audience, where the followers are and the income, and nothing the server does not measure', async () => {
    vi.mocked(creatorApi.getStats).mockResolvedValue({
      data: {
        ...emptyStats,
        followerCount: 4,
        geoDistribution: [
          { location: 'Unknown', count: 1 },
          { location: 'Madrid', count: 3 },
        ],
      },
    } as never);
    vi.mocked(monetizationApi.getFinancialSummary).mockResolvedValue({
      currentMonthIncome: 899,
      totalTips: 500,
    } as never);
    renderWithProviders(<CreatorAnalyticsTab />);

    expect(
      await screen.findByRole('heading', {
        name: 'Views and followers, day by day',
      }),
    ).toBeInTheDocument();
    // The place with most followers first; the ones with none given, in words.
    const places = screen.getAllByText(/^(Madrid|No place given)$/);
    expect(places.map((place) => place.textContent)).toEqual([
      'Madrid',
      'No place given',
    ]);
    expect(screen.getByText('3 followers')).toBeInTheDocument();
    expect(screen.getByText('75 %')).toBeInTheDocument();
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(screen.getByText('€8.99')).toBeInTheDocument();
    expect(screen.getByText('€5.00')).toBeInTheDocument();
    // Fixed zeros and an answer that is always empty are not drawn.
    expect(screen.queryByText(/retention of subscriptions/i)).toBeNull();
    expect(screen.queryByText(/most active hours/i)).toBeNull();
  });

  it('says in Spanish what will appear while there is nothing to draw', async () => {
    renderWithProviders(<CreatorAnalyticsTab />, { lng: 'es' });

    expect(
      await screen.findByText(
        'Todavía no hay días suficientes para dibujar la evolución.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tus seguidores aún no han indicado dónde están.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Todavía no hay meses suficientes para dibujar tus ingresos.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).toBeNull();
  });
});
