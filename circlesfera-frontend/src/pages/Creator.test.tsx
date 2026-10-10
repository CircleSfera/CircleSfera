import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorApi } from '../services/creator.service';
import { renderWithProviders } from '../test/test-utils';
import Creator from './Creator';

vi.mock('../services/creator.service', () => ({
  creatorApi: { getStats: vi.fn(), getActivityChart: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});
vi.mock('../components/creator/CreatorShell', () => ({
  default: ({
    activeTab,
    children,
  }: {
    activeTab: string;
    children: ReactNode;
  }) => (
    <div>
      <output data-testid="tab">{activeTab}</output>
      {children}
    </div>
  ),
}));
vi.mock('../components/creator/CreatorDashboard', () => ({
  default: (props: {
    onPromote: (post: { id: string }) => void;
    onNavigate: (tab: string) => void;
    stats?: { followers: number };
    chartData?: unknown[];
  }) => (
    <div>
      overview with {props.stats?.followers ?? 'no'} followers and{' '}
      {props.chartData?.length ?? 'no'} days
      <button type="button" onClick={() => props.onPromote({ id: 'post-1' })}>
        promote from overview
      </button>
      <button type="button" onClick={() => props.onNavigate('analytics')}>
        see analytics
      </button>
    </div>
  ),
}));
vi.mock('../components/creator/CreatorAnalyticsTab', () => ({
  default: () => <p>analytics tab</p>,
}));
vi.mock('../components/creator/CreatorPostsTab', () => ({
  default: (props: { onPromote: (post: { id: string }) => void }) => (
    <button type="button" onClick={() => props.onPromote({ id: 'post-2' })}>
      promote from posts
    </button>
  ),
}));
vi.mock('../components/creator/CreatorStoriesTab', () => ({
  default: () => <p>stories tab</p>,
}));
vi.mock('../components/creator/CreatorMoneyTab', () => ({
  default: (props: { onToast: (text: string, type: string) => void }) => (
    <button type="button" onClick={() => props.onToast('paid out', 'info')}>
      money tab
    </button>
  ),
}));
vi.mock('../components/creator/CreatorPromotionsTab', () => ({
  default: () => <p>promotions tab</p>,
}));
vi.mock('../components/creator/PromoteModal', () => ({
  default: (props: { post: { id: string }; onClose: () => void }) => (
    <div data-testid="promote">
      promoting {props.post.id}
      <button type="button" onClick={props.onClose}>
        close promote
      </button>
    </div>
  ),
}));

const api = vi.mocked(creatorApi);
function Where() {
  const location = useLocation();
  return (
    <output data-testid="where">{location.pathname + location.search}</output>
  );
}
const show = (route: string) =>
  renderWithProviders(
    <>
      <Routes>
        <Route path="/creator" element={<Creator />} />
        <Route path="/creator/:tab" element={<Creator />} />
      </Routes>
      <Where />
    </>,
    { routerProps: { useTransitions: false, initialEntries: [route] } },
  );
const where = () => screen.getByTestId('where').textContent;
const tab = () => screen.getByTestId('tab').textContent;

describe('Creator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getStats.mockResolvedValue({ data: { followers: 12 } } as never);
    api.getActivityChart.mockResolvedValue({ data: [{}, {}, {}] } as never);
  });

  it('opens on the overview, with the figures once they arrive', async () => {
    show('/creator');

    expect(tab()).toBe('overview');
    expect(
      await screen.findByText(/overview with 12 followers and 3 days/),
    ).toBeInTheDocument();
  });

  it.each([
    ['analytics', 'analytics tab'],
    ['stories', 'stories tab'],
    ['ads', 'promotions tab'],
    ['monetization', 'money tab'],
    ['content', 'promote from posts'],
  ])('shows the %s tab', async (name, text) => {
    show(`/creator/${name}`);

    expect(tab()).toBe(name);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('moves to another tab from the overview', async () => {
    show('/creator/overview');

    fireEvent.click(
      await screen.findByRole('button', { name: 'see analytics' }),
    );

    await waitFor(() => expect(where()).toBe('/creator/analytics'));
    expect(await screen.findByText('analytics tab')).toBeInTheDocument();
  });

  it('sends the old finance address to monetization, keeping what it carried', async () => {
    show('/creator/finance?from=mail');

    await waitFor(() =>
      expect(where()).toBe('/creator/monetization?from=mail'),
    );
    expect(tab()).toBe('monetization');
  });

  it('sends the old finance address to monetization when it carried nothing', async () => {
    show('/creator/finance');

    await waitFor(() => expect(where()).toBe('/creator/monetization'));
  });

  it('sends an unknown tab to the overview', async () => {
    show('/creator/nonsense');

    await waitFor(() => expect(where()).toBe('/creator/overview'));
  });

  it('opens the promotion of a post from the overview and from the posts, and closes it', async () => {
    show('/creator/overview');

    fireEvent.click(
      await screen.findByRole('button', { name: 'promote from overview' }),
    );
    expect(await screen.findByTestId('promote')).toHaveTextContent(
      'promoting post-1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'close promote' }));
    await waitFor(() =>
      expect(screen.queryByTestId('promote')).not.toBeInTheDocument(),
    );
  });

  it('opens the promotion of a post from the posts tab', async () => {
    show('/creator/content');

    fireEvent.click(
      await screen.findByRole('button', { name: 'promote from posts' }),
    );

    expect(await screen.findByTestId('promote')).toHaveTextContent(
      'promoting post-2',
    );
  });

  it('says the payment of a promotion arrived, once, and cleans the address', async () => {
    show('/creator/ads?promotion=success&id=pr-1&keep=1');

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Promotion payment received. The campaign will activate shortly.',
      ),
    );
    await waitFor(() => expect(where()).toBe('/creator/ads?keep=1'));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('says the payment of a promotion was cancelled', async () => {
    show('/creator/ads?promotion=cancelled');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Promotion payment cancelled. The campaign remains pending.',
      ),
    );
    await waitFor(() => expect(where()).toBe('/creator/ads'));
  });

  it('says nothing for a return it does not know, and still cleans the address', async () => {
    show('/creator/ads?promotion=other');

    await waitFor(() => expect(where()).toBe('/creator/ads'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('passes the notices of the money tab on', async () => {
    show('/creator/monetization');

    fireEvent.click(await screen.findByRole('button', { name: 'money tab' }));

    expect(toast).toHaveBeenCalledWith('paid out');
  });
});
