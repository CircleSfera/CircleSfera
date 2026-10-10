import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorApi } from '../services/creator.service';
import { renderWithProviders } from '../test/test-utils';
import Creator from './Creator';

const toast = vi.hoisted(() => vi.fn());

vi.mock('framer-motion', async () =>
  (await import('../test/still-motion')).stillMotion(),
);
vi.mock('../services/creator.service', () => ({
  creatorApi: { getStats: vi.fn(), getActivityChart: vi.fn() },
}));
vi.mock('../components/creator/creatorToast', () => ({ creatorToast: toast }));
vi.mock('../components/creator/CreatorShell', () => ({
  default: ({
    activeTab,
    children,
  }: {
    activeTab: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="shell" data-tab={activeTab}>
      {children}
    </div>
  ),
}));
vi.mock('../components/creator/CreatorDashboard', () => ({
  default: (props: {
    stats?: { postCount: number };
    chartData?: unknown[];
    onPromote: (post: { id: string }) => void;
    onNavigate: (tab: string) => void;
  }) => (
    <div>
      <p>
        overview: {props.stats?.postCount ?? 'no stats'} posts,{' '}
        {props.chartData?.length ?? 'no'} days
      </p>
      <button type="button" onClick={() => props.onPromote({ id: 'p1' })}>
        promote from overview
      </button>
      <button type="button" onClick={() => props.onNavigate('ads')}>
        go to ads
      </button>
    </div>
  ),
}));
vi.mock('../components/creator/CreatorAnalyticsTab', () => ({
  default: () => <p>analytics tab</p>,
}));
vi.mock('../components/creator/CreatorPostsTab', () => ({
  default: ({ onPromote }: { onPromote: (post: { id: string }) => void }) => (
    <button type="button" onClick={() => onPromote({ id: 'p2' })}>
      promote from content
    </button>
  ),
}));
vi.mock('../components/creator/CreatorStoriesTab', () => ({
  default: () => <p>stories tab</p>,
}));
vi.mock('../components/creator/CreatorMoneyTab', () => ({
  default: ({
    onToast,
  }: {
    onToast: (message: string, type: string) => void;
  }) => (
    <button type="button" onClick={() => onToast('saved', 'success')}>
      money tab
    </button>
  ),
}));
vi.mock('../components/creator/CreatorPromotionsTab', () => ({
  default: () => <p>ads tab</p>,
}));
vi.mock('../components/creator/PromoteModal', () => ({
  default: ({
    post,
    onClose,
  }: {
    post: { id: string };
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="promote">
      <span>promoting {post.id}</span>
      <button type="button" onClick={onClose}>
        close promote
      </button>
    </div>
  ),
}));

let where = '';
function Where() {
  const location = useLocation();
  where = location.pathname + location.search;
  return null;
}

function visit(path: string) {
  return renderWithProviders(
    <>
      <Where />
      <Routes>
        <Route path="/creator" element={<Creator />} />
        <Route path="/creator/:tab" element={<Creator />} />
      </Routes>
    </>,
    { routerProps: { initialEntries: [path], useTransitions: false } },
  );
}

describe('Creator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    where = '';
    vi.mocked(creatorApi.getStats).mockResolvedValue({
      data: { postCount: 12 },
    } as never);
    vi.mocked(creatorApi.getActivityChart).mockResolvedValue({
      data: [{}, {}, {}],
    } as never);
  });

  it('opens on the overview, with the figures and the activity of the creator', async () => {
    visit('/creator');

    expect(
      await screen.findByText('overview: 12 posts, 3 days'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toHaveAttribute('data-tab', 'overview');
  });

  it.each([
    ['analytics', 'analytics tab'],
    ['stories', 'stories tab'],
    ['ads', 'ads tab'],
    ['monetization', 'money tab'],
    ['content', 'promote from content'],
  ])('shows the %s section at its address', async (tab, content) => {
    visit(`/creator/${tab}`);

    expect(await screen.findByText(content)).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toHaveAttribute('data-tab', tab);
  });

  it('sends an address that is no section to the overview', async () => {
    visit('/creator/nonsense');

    await waitFor(() => expect(where).toBe('/creator/overview'));
    // The section is drawn again after the change of address.
    await waitFor(() =>
      expect(screen.getByText(/^overview:/)).toBeInTheDocument(),
    );
    expect(screen.getByTestId('shell')).toHaveAttribute('data-tab', 'overview');
  });

  it('sends the old finance address to monetization, keeping what came with it', async () => {
    visit('/creator/finance?connected=1');

    await waitFor(() =>
      expect(where).toBe('/creator/monetization?connected=1'),
    );
    await waitFor(() =>
      expect(screen.getByText('money tab')).toBeInTheDocument(),
    );
  });

  it('moves to another section from the overview', async () => {
    visit('/creator/overview');

    fireEvent.click(await screen.findByRole('button', { name: 'go to ads' }));

    expect(await screen.findByText('ads tab')).toBeInTheDocument();
    expect(where).toBe('/creator/ads');
  });

  it.each([
    ['/creator/overview', 'promote from overview', 'promoting p1'],
    ['/creator/content', 'promote from content', 'promoting p2'],
  ])(
    'opens the promotion of a post from %s and closes it',
    async (path, button, shown) => {
      visit(path);

      fireEvent.click(await screen.findByRole('button', { name: button }));
      expect(await screen.findByText(shown)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'close promote' }));
      expect(
        screen.queryByRole('dialog', { name: 'promote' }),
      ).not.toBeInTheDocument();
    },
  );

  it('gives the sections the way to show a notice', async () => {
    visit('/creator/monetization');
    fireEvent.click(await screen.findByRole('button', { name: 'money tab' }));
    expect(toast).toHaveBeenCalledWith('saved', 'success');
  });

  describe('coming back from the payment of a promotion', () => {
    it('says the payment was received and cleans the address, keeping the rest of it', async () => {
      visit('/creator/ads?promotion=success&id=pr1&from=mail');

      await waitFor(() => expect(where).toBe('/creator/ads?from=mail'));
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(
        'Promotion payment received. The campaign will activate shortly.',
        'success',
      );
    });

    it('says the payment was cancelled', async () => {
      visit('/creator/ads?promotion=cancelled');

      await waitFor(() => expect(where).toBe('/creator/ads'));
      expect(toast).toHaveBeenCalledWith(
        'Promotion payment cancelled. The campaign remains pending.',
        'error',
      );
    });

    it('cleans the address without a notice for a value it does not know', async () => {
      visit('/creator/ads?promotion=maybe');

      await waitFor(() => expect(where).toBe('/creator/ads'));
      expect(toast).not.toHaveBeenCalled();
    });
  });
});
