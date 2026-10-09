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
  mrr: 0,
  subscriberCount: 0,
  geoDistribution: [],
  activityHours: [],
  retentionStatus: { active: 0, churning: 0, churned: 0 },
  insights: {
    bestDayToPost: '—',
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

  it('labels analytics section headers from the catalog', async () => {
    const { i18n } = renderWithProviders(<CreatorAnalyticsTab />);

    expect(
      await screen.findByText(i18n!.t('creator.analytics.audience_evolution')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.analytics.income_history')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.analytics.sub_retention')),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.analytics.income_history')).toBe(
      'Income history (6 months)',
    );
  });

  it('uses Spanish section headers when locale is es', async () => {
    const { i18n } = renderWithProviders(<CreatorAnalyticsTab />, {
      lng: 'es',
    });

    expect(
      await screen.findByText(i18n!.t('creator.analytics.income_history')),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.analytics.income_history')).toBe(
      'Historial de ingresos (6 meses)',
    );
    expect(
      screen.queryByText('Income history (6 months)'),
    ).not.toBeInTheDocument();
  });
});
