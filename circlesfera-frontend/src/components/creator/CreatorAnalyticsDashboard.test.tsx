import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const revenue = {
  period: '30d',
  grossRevenue: 1000,
  subscriptionsTotal: 0,
  tipsTotal: 600.5,
  postUnlocksTotal: 300,
  giftsTotal: 99.5,
  activeSubscribersCount: 0,
  totalFollowersCount: 40,
  conversionRate: 0,
  currency: 'EUR',
};

const noHours = {
  avgDwellSeconds: 0,
  totalInteractionsSampled: 0,
  peakActivityHourUTC: 0,
  hourlyDistribution: Array.from({ length: 24 }, () => 0),
};

describe('CreatorAnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getRevenueAnalytics).mockResolvedValue({
      data: revenue,
    } as never);
    vi.mocked(creatorApi.getAudienceRetentionAnalytics).mockResolvedValue({
      data: noHours,
    } as never);
    vi.mocked(creatorApi.getTopPerformingContent).mockResolvedValue({
      data: [],
    } as never);
  });

  it('writes the income of the period by kind, in the format of the reader', async () => {
    renderWithProviders(<CreatorAnalyticsDashboard />);

    expect(
      await screen.findByRole('heading', { name: 'Income by period' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('€1,000.00')).toBeInTheDocument();
    expect(screen.getByText('€600.50')).toBeInTheDocument();
    expect(screen.getByText('€300.00')).toBeInTheDocument();
    expect(screen.getByText('€99.50')).toBeInTheDocument();
    expect(screen.getByText('Before the platform fee.')).toBeInTheDocument();
  });

  it('leaves out what the server never measures', async () => {
    renderWithProviders(<CreatorAnalyticsDashboard />);

    await screen.findByText('€1,000.00');
    expect(screen.queryByText(/subscri/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conversion/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dwell/i)).not.toBeInTheDocument();
  });

  it('shows subscriptions only when some income came from them', async () => {
    vi.mocked(creatorApi.getRevenueAnalytics).mockResolvedValue({
      data: { ...revenue, subscriptionsTotal: 25 },
    } as never);
    renderWithProviders(<CreatorAnalyticsDashboard />);

    expect(await screen.findByText('Subscriptions')).toBeInTheDocument();
    expect(screen.getByText('€25.00')).toBeInTheDocument();
  });

  it('asks again when another period is chosen, named in words', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreatorAnalyticsDashboard />);

    const chosen = await screen.findByRole('button', { name: '30 days' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '1 year' }));

    await waitFor(() =>
      expect(creatorApi.getRevenueAnalytics).toHaveBeenLastCalledWith('1y'),
    );
  });

  it('says there is nothing to measure instead of naming an hour', async () => {
    renderWithProviders(<CreatorAnalyticsDashboard />);

    expect(
      await screen.findByText(
        'Nobody has stopped on your posts long enough to measure yet.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws the hours of the day when there are measured views', async () => {
    const hourlyDistribution = Array.from({ length: 24 }, () => 0);
    hourlyDistribution[18] = 7;
    hourlyDistribution[9] = 3;
    vi.mocked(creatorApi.getAudienceRetentionAnalytics).mockResolvedValue({
      data: { ...noHours, totalInteractionsSampled: 10, hourlyDistribution },
    } as never);
    renderWithProviders(<CreatorAnalyticsDashboard />);

    expect(
      await screen.findByRole('img', { name: /^Views by hour of the day/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^From 10 measured views, in your time\. Most at /),
    ).toBeInTheDocument();
  });

  it('lists the best posts as rows with their facts in words and no bare score', async () => {
    vi.mocked(creatorApi.getTopPerformingContent).mockResolvedValue({
      data: [
        {
          id: 'p1',
          caption: 'Sunset over the bay',
          views: 1200,
          performanceScore: 140,
          likes: 31,
          comments: 1,
          bookmarks: 4,
          thumbnailUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'p2',
          caption: null,
          views: 10,
          performanceScore: 101,
          likes: 2,
          comments: 0,
          bookmarks: 0,
          thumbnailUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as never);
    renderWithProviders(<CreatorAnalyticsDashboard />);

    expect(await screen.findByText('Sunset over the bay')).toBeInTheDocument();
    expect(
      screen.getByText('1,200 views · 31 likes · 1 comment'),
    ).toBeInTheDocument();
    expect(screen.getByText('saved 4 times')).toBeInTheDocument();
    expect(screen.getByText('Untitled post')).toBeInTheDocument();
    expect(screen.queryByText(/140/)).not.toBeInTheDocument();
    expect(screen.queryByText(/average/)).not.toBeInTheDocument();
  });

  it('says so when the answer does not arrive, and asks again on request', async () => {
    const user = userEvent.setup();
    vi.mocked(creatorApi.getRevenueAnalytics).mockRejectedValueOnce(
      new Error('down'),
    );
    renderWithProviders(<CreatorAnalyticsDashboard />);

    expect(
      await screen.findByText('The advanced analytics could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Your best posts')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('€1,000.00')).toBeInTheDocument();
    expect(creatorApi.getRevenueAnalytics).toHaveBeenCalledTimes(2);
  });

  it('writes its headings in Spanish for a Spanish reader', async () => {
    renderWithProviders(<CreatorAnalyticsDashboard />, { lng: 'es' });

    expect(
      await screen.findByRole('heading', { name: 'Ingresos por periodo' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 días' })).toBeInTheDocument();
    expect(screen.queryByText('Income by period')).not.toBeInTheDocument();
  });
});
