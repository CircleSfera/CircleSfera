import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import type { Profile } from '../../types';
import MonetizationDashboard from './MonetizationDashboard';

vi.mock('../../services', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

describe('MonetizationDashboard', () => {
  const renderDashboard = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MonetizationDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue({
      profile: { user: { stripeConnectAccountId: null } } as unknown as Profile,
    } as unknown as ReturnType<typeof useAuthStore>);
  });

  it('renders lifetime earnings from the monetization query', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/monetization') {
        return Promise.resolve({
          data: { userId: 'user-1', lifetimeEarningsCents: 12345 },
        });
      }
      if (url === '/monetization/transactions') {
        return Promise.resolve({ data: { data: [] } });
      }
      if (url === '/monetization/payouts') {
        return Promise.resolve({
          data: { available: [], pending: [], payouts: [] },
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('$123.45')).toBeInTheDocument();
    });
  });

  it('prompts to connect Stripe when the creator has no connected account', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/monetization/payouts') {
        return Promise.reject(new Error('no connect'));
      }
      return Promise.resolve({ data: { data: [] } });
    });

    renderDashboard();

    expect(await screen.findByText(/Connect with Stripe/i)).toBeInTheDocument();
  });

  it('shows the Stripe dashboard link once a Stripe account is connected', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      profile: {
        user: { stripeConnectAccountId: 'acct_123' },
      } as unknown as Profile,
    } as unknown as ReturnType<typeof useAuthStore>);
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/monetization/payouts') {
        return Promise.resolve({
          data: {
            available: [{ amountCents: 1000, currency: 'EUR' }],
            pending: [{ amountCents: 0, currency: 'EUR' }],
            payouts: [],
          },
        });
      }
      return Promise.resolve({ data: { data: [], lifetimeEarningsCents: 0 } });
    });

    renderDashboard();

    expect(
      await screen.findByText(/View Stripe Dashboard/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Connect with Stripe/i)).not.toBeInTheDocument();
  });

  it('renders transactions returned by the transactions query', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/monetization') {
        return Promise.resolve({
          data: { userId: 'user-1', lifetimeEarningsCents: 0 },
        });
      }
      if (url === '/monetization/transactions') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 'tx-1',
                type: 'TIP',
                amount: 500,
                receiverId: 'user-1',
                createdAt: new Date('2026-01-01').toISOString(),
                description: 'Tip from a fan',
              },
            ],
          },
        });
      }
      if (url === '/monetization/payouts') {
        return Promise.resolve({
          data: { available: [], pending: [], payouts: [] },
        });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });

    renderDashboard();

    expect(await screen.findByText('Tip from a fan')).toBeInTheDocument();
    expect(screen.getByText('+$5.00')).toBeInTheDocument();
  });

  it('shows an empty state when there are no transactions', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/monetization/payouts') {
        return Promise.reject(new Error('no connect'));
      }
      return Promise.resolve({ data: { data: [] } });
    });

    renderDashboard();

    expect(
      await screen.findByText(/No transactions found/i),
    ).toBeInTheDocument();
  });
});
