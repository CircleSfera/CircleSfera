import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import { CreatorAnalyticsDashboard } from './CreatorAnalyticsDashboard';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getAudienceRetentionAnalytics: vi.fn(),
    getTopPerformingContent: vi.fn(),
    exportAnalyticsCsv: vi.fn(),
  },
}));

const noHours = {
  avgDwellSeconds: 0,
  totalInteractionsSampled: 0,
  peakActivityHourUTC: 0,
  hourlyDistribution: Array.from({ length: 24 }, () => 0),
};

describe('CreatorAnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getAudienceRetentionAnalytics).mockResolvedValue({
      data: noHours,
    } as never);
    vi.mocked(creatorApi.getTopPerformingContent).mockResolvedValue({
      data: [],
    } as never);
  });

  it('exports the report of the period chosen, named in words', async () => {
    const user = userEvent.setup();
    vi.mocked(creatorApi.exportAnalyticsCsv).mockResolvedValue({
      data: 'a,b',
    } as never);
    URL.createObjectURL = vi.fn(() => 'blob:report');
    URL.revokeObjectURL = vi.fn();
    renderWithProviders(<CreatorAnalyticsDashboard />);

    const chosen = await screen.findByRole('button', { name: '30 days' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '1 year' }));
    await user.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() =>
      expect(creatorApi.exportAnalyticsCsv).toHaveBeenCalledWith('1y'),
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
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => logged.mockRestore());
    const user = userEvent.setup();
    vi.mocked(creatorApi.getAudienceRetentionAnalytics).mockRejectedValueOnce(
      new Error('down'),
    );
    renderWithProviders(<CreatorAnalyticsDashboard />);

    expect(
      await screen.findByText('The advanced analytics could not be loaded.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Your best posts')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Your best posts')).toBeInTheDocument();
    expect(creatorApi.getAudienceRetentionAnalytics).toHaveBeenCalledTimes(2);
    expect(logged).toHaveBeenCalledWith(
      'Failed to fetch creator analytics:',
      new Error('down'),
    );
  });

  it('writes its headings in Spanish for a Spanish reader', async () => {
    renderWithProviders(<CreatorAnalyticsDashboard />, { lng: 'es' });

    expect(
      await screen.findByRole('heading', { name: 'Informe por periodo' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 días' })).toBeInTheDocument();
    expect(screen.queryByText('Report by period')).not.toBeInTheDocument();
  });
});
