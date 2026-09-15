import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import { CreatorAnalyticsDashboard } from './CreatorAnalyticsDashboard';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getRevenueAnalytics: vi.fn(),
    getAudienceRetentionAnalytics: vi.fn(),
    getTopPerformingContent: vi.fn(),
    exportAnalyticsCsv: vi.fn(),
  },
}));

describe('CreatorAnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getRevenueAnalytics).mockResolvedValue({
      data: {
        period: '30d',
        grossRevenue: 1000,
        subscriptionsTotal: 600,
        tipsTotal: 100,
        postUnlocksTotal: 200,
        giftsTotal: 100,
        activeSubscribersCount: 4,
        totalFollowersCount: 40,
        conversionRate: 10,
        currency: 'EUR',
      },
    } as never);
    vi.mocked(creatorApi.getAudienceRetentionAnalytics).mockResolvedValue({
      data: {
        avgDwellSeconds: 12,
        totalInteractionsSampled: 50,
        peakActivityHourUTC: 18,
        hourlyDistribution: Array.from({ length: 24 }, () => 1),
      },
    } as never);
    vi.mocked(creatorApi.getTopPerformingContent).mockResolvedValue({
      data: [],
    } as never);
  });

  it('labels chrome from the EN catalog', async () => {
    const { i18n } = renderWithProviders(<CreatorAnalyticsDashboard />);

    expect(
      await screen.findByRole('heading', {
        name: i18n!.t('creator.advanced.title'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.advanced.subtitle')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.advanced.gross')),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.advanced.title')).toBe('Revenue and retention');
    expect(screen.queryByText('Ingresos y retención')).not.toBeInTheDocument();
  });

  it('uses Spanish chrome when locale is es', async () => {
    const { i18n } = renderWithProviders(<CreatorAnalyticsDashboard />, {
      lng: 'es',
    });

    expect(
      await screen.findByRole('heading', {
        name: i18n!.t('creator.advanced.title'),
      }),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.advanced.title')).toBe('Ingresos y retención');
    expect(screen.queryByText('Revenue and retention')).not.toBeInTheDocument();
  });
});
