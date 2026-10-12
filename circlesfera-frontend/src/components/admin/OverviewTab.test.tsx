import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { useAdminAuthStore } from '../../stores/adminAuthStore';
import { renderWithProviders } from '../../test/test-utils';
import OverviewTab from './OverviewTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getMonetizationAnalytics: vi.fn(),
    getPayoutStats: vi.fn(),
    getSupportTickets: vi.fn(),
    getPromotions: vi.fn(),
    getDisputes: vi.fn(),
  },
}));

const total = (n: number) => ({ data: { data: [], meta: { total: n } } });
const withPermissions = (...permissions: string[]) =>
  useAdminAuthStore.setState({
    hasPermission: (key: string) => permissions.includes(key),
  } as never);

describe('OverviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getMonetizationAnalytics).mockResolvedValue({
      data: {
        activeMRR: 79.97,
        totalSubscriptions: 3,
        tierDistribution: { PREMIUM: 1, ELITE: 1, BUSINESS: 1 },
        subscriptionGrowth: 0,
      },
    } as never);
    vi.mocked(adminApi.getPayoutStats).mockResolvedValue({
      data: { paid: 5, pending: 2, failed: 1, total: 8 },
    } as never);
    vi.mocked(adminApi.getSupportTickets).mockImplementation(((
      _page: number,
      _limit: number,
      status: string,
      _category: string,
      team?: { target?: string },
    ) =>
      Promise.resolve(
        total(team?.target === 'past' ? 2 : status === 'OPEN' ? 4 : 1),
      )) as never);
    vi.mocked(adminApi.getPromotions).mockResolvedValue(total(6) as never);
    vi.mocked(adminApi.getDisputes).mockResolvedValue({
      data: { data: [], meta: { total: 2, openCount: 2 } },
    } as never);
  });

  it('shows every figure to an operator with every permission, each linked to its section', async () => {
    withPermissions('payments', 'support', 'content');
    renderWithProviders(<OverviewTab />);

    const subscriptions = await screen.findByRole('link', {
      name: /Active subscriptions/,
    });
    await waitFor(() => expect(subscriptions).toHaveTextContent('3'));
    expect(subscriptions).toHaveAttribute('href', '/subscriptions');
    expect(subscriptions).toHaveTextContent('Premium 1 · Elite 1 · Business 1');

    expect(
      screen.getByRole('link', { name: /Monthly recurring revenue/ }),
    ).toHaveTextContent(/79[.,]97/);
    const payouts = screen.getByRole('link', { name: /Failed payouts/ });
    expect(payouts).toHaveAttribute('href', '/payouts');
    await waitFor(() => expect(payouts).toHaveTextContent('2 pending'));

    const disputes = screen.getByRole('link', { name: /Open disputes/ });
    await waitFor(() => expect(disputes).toHaveTextContent('2'));
    expect(disputes).toHaveAttribute('href', '/disputes');

    const tickets = screen.getByRole('link', { name: /Open tickets/ });
    await waitFor(() => expect(tickets).toHaveTextContent('4'));
    expect(tickets).toHaveTextContent('2 past target · 1 with moderation');
    expect(tickets).toHaveAttribute('href', '/support');

    const promotions = screen.getByRole('link', {
      name: /Promotions to review/,
    });
    await waitFor(() => expect(promotions).toHaveTextContent('6'));
    expect(promotions).toHaveAttribute('href', '/promotions');
  });

  it('puts what waits for someone before what is calm, and the business after', async () => {
    vi.mocked(adminApi.getDisputes).mockResolvedValue({
      data: { data: [], meta: { total: 0, openCount: 0 } },
    } as never);
    vi.mocked(adminApi.getPayoutStats).mockResolvedValue({
      data: { paid: 5, pending: 0, failed: 0, total: 5 },
    } as never);
    withPermissions('payments', 'support', 'content');
    renderWithProviders(<OverviewTab />);

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: /Promotions to review/ }),
      ).toHaveTextContent('6'),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('link').map((link) => link.getAttribute('href')),
      ).toEqual([
        '/support',
        '/promotions',
        '/disputes',
        '/payouts',
        '/subscriptions',
        '/monetization',
      ]),
    );
    expect(
      screen.getByRole('heading', { name: 'Waiting for someone' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'The business' }),
    ).toBeInTheDocument();
  });

  it('names no business to an operator who may not see it', async () => {
    withPermissions('support');
    renderWithProviders(<OverviewTab />);

    await screen.findByRole('link', { name: /Open tickets/ });
    expect(screen.queryByRole('heading', { name: 'The business' })).toBeNull();
  });

  it('shows and asks for only what the operator may see', async () => {
    withPermissions('support');
    renderWithProviders(<OverviewTab />);

    expect(
      await screen.findByRole('link', { name: /Open tickets/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /subscriptions/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /payouts/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Promotions/ })).toBeNull();
    expect(adminApi.getMonetizationAnalytics).not.toHaveBeenCalled();
    expect(adminApi.getPayoutStats).not.toHaveBeenCalled();
    expect(adminApi.getPromotions).not.toHaveBeenCalled();
    expect(adminApi.getDisputes).not.toHaveBeenCalled();
  });
});
