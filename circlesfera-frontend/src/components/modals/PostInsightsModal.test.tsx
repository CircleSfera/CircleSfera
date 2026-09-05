import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import PostInsightsModal from './PostInsightsModal';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getPostInsights: vi.fn(),
  },
}));

function insights(overrides: {
  views?: number;
  impressions?: number;
  likes?: number;
  comments?: number;
  bookmarks?: number;
  shares?: number;
  totalDwellTime?: number;
  conversionRate?: number;
  chart?: { date: string; views: number }[];
}) {
  return {
    post: {
      id: 'post-1',
      caption: 'Hello',
      type: 'POST',
      views: overrides.views ?? 80,
      performanceScore: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      impressions: overrides.impressions ?? 200,
      shares: overrides.shares ?? 4,
      totalDwellTime: overrides.totalDwellTime ?? 45,
      conversionRate: overrides.conversionRate ?? 3.2,
      _count: {
        likes: overrides.likes ?? 8,
        comments: overrides.comments ?? 2,
        bookmarks: overrides.bookmarks ?? 5,
      },
    },
    chart: overrides.chart ?? [],
  };
}

describe('PostInsightsModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getPostInsights).mockResolvedValue({
      data: insights({}),
    } as never);
  });

  it('loads insights for the post and closes from the dialog X', async () => {
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(await screen.findByText('Post Statistics')).toBeInTheDocument();
    expect(creatorApi.getPostInsights).toHaveBeenCalledWith('post-1');

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders counts, dwell seconds and conversion percent', async () => {
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(await screen.findByText('80')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.getByText('3.2%')).toBeInTheDocument();
    expect(
      screen.getByText('Not enough historical data yet'),
    ).toBeInTheDocument();
  });

  it('formats dwell over a minute as minutes', async () => {
    vi.mocked(creatorApi.getPostInsights).mockResolvedValue({
      data: insights({ totalDwellTime: 90 }),
    } as never);

    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(await screen.findByText('1.5m')).toBeInTheDocument();
  });

  it('keeps promoting when views are 100 or below', async () => {
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(
      await screen.findByText(/engagement rate of\s+12\.5%/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Keep promoting to gain more reach/i),
    ).toBeInTheDocument();
  });

  it('says above average when views exceed 100', async () => {
    vi.mocked(creatorApi.getPostInsights).mockResolvedValue({
      data: insights({ views: 200, likes: 10, comments: 10 }),
    } as never);

    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(
      await screen.findByText(/engagement rate of\s+10\.0%/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/beating your category average/i),
    ).toBeInTheDocument();
  });
});
