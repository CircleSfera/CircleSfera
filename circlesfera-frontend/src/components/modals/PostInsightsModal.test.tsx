import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  totalDwellTime?: number;
  conversionRate?: number;
  caption?: string | null;
  chart?: { date: string; views: number }[];
}) {
  return {
    post: {
      id: 'post-1',
      caption: overrides.caption === undefined ? 'Hello' : overrides.caption,
      type: 'POST',
      views: overrides.views ?? 1280,
      performanceScore: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      impressions: 2000,
      shares: 4,
      totalDwellTime: overrides.totalDwellTime ?? 45,
      conversionRate: overrides.conversionRate ?? 3.2,
      _count: { likes: 8, comments: 2, bookmarks: 5 },
    },
    chart: overrides.chart ?? [],
  };
}

// The value written under a label of the list of figures.
const figure = (label: string) =>
  within(screen.getByText(label).parentElement as HTMLElement).getByRole(
    'definition',
  ).textContent;

describe('PostInsightsModal', () => {
  const onClose = vi.fn();
  const answer = (data: ReturnType<typeof insights>) =>
    vi.mocked(creatorApi.getPostInsights).mockResolvedValue({ data } as never);

  beforeEach(() => {
    vi.clearAllMocks();
    answer(insights({}));
  });

  it('asks for the statistics of the post and closes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Statistics of the post' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(creatorApi.getPostInsights).toHaveBeenCalledWith('post-1');
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('writes each figure under its name, in the format of the reader', async () => {
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    await screen.findByText('Hello');
    expect(figure('Views')).toBe('1,280');
    expect(figure('Times shown')).toBe('2,000');
    expect(figure('Likes')).toBe('8');
    expect(figure('Comments')).toBe('2');
    expect(figure('Saves')).toBe('5');
    expect(figure('Shares')).toBe('4');
    expect(figure('Time watched')).toBe('45 s');
    expect(figure('Interaction')).toBe('3.2 %');
  });

  it('says what the interaction counts, and no verdict about the post', async () => {
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(
      await screen.findByText(
        'Interaction is the likes, comments and saves for every 100 views. Time watched is the total of every view.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/average/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conv/i)).not.toBeInTheDocument();
  });

  it('writes a long time in minutes and in hours', async () => {
    answer(insights({ totalDwellTime: 200 }));
    const first = renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );
    await screen.findByText('Hello');
    expect(figure('Time watched')).toBe('3 min 20 s');
    first.unmount();

    answer(insights({ totalDwellTime: 3900 }));
    renderWithProviders(
      <PostInsightsModal postId="post-2" onClose={onClose} />,
    );
    await screen.findByText('Hello');
    expect(figure('Time watched')).toBe('1 h 5 min');
  });

  it('says there are too few days instead of drawing a chart of one point', async () => {
    answer(insights({ chart: [{ date: '2026-01-01', views: 3 }] }));
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(
      await screen.findByText(
        'There are not enough days yet to draw how its views changed.',
      ),
    ).toBeInTheDocument();
  });

  it('says so when the statistics do not arrive', async () => {
    vi.mocked(creatorApi.getPostInsights).mockRejectedValue(new Error('no'));
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
    );

    expect(
      await screen.findByText(
        'The statistics could not be loaded. Try again in a moment.',
      ),
    ).toBeInTheDocument();
  });

  it('is written in Spanish for a Spanish reader', async () => {
    renderWithProviders(
      <PostInsightsModal postId="post-1" onClose={onClose} />,
      { lng: 'es' },
    );

    expect(
      screen.getByRole('heading', { name: 'Estadísticas de la publicación' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Veces mostrada')).toBeInTheDocument();
    expect(figure('Interacción')).toBe('3,2 %');
  });
});
