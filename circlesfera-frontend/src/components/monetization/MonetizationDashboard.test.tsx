import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monetizationApi } from '../../services/monetization.service';
import { useAuthStore } from '../../stores/authStore';
import MonetizationDashboard from './MonetizationDashboard';

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: {
    getMonetization: vi.fn(),
    getFinancialSummary: vi.fn(),
    getTransactions: vi.fn(),
    getPayouts: vi.fn(),
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
        <MonetizationDashboard />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue({
      user: { stripeConnectAccountId: null },
    } as unknown as ReturnType<typeof useAuthStore>);
    vi.mocked(monetizationApi.getMonetization).mockResolvedValue({
      userId: 'user-1',
      lifetimeEarningsCents: 0,
    });
    vi.mocked(monetizationApi.getFinancialSummary).mockResolvedValue({
      currentMonthIncome: 0,
      totalTips: 0,
    });
    vi.mocked(monetizationApi.getTransactions).mockResolvedValue({
      data: [],
    });
    vi.mocked(monetizationApi.getPayouts).mockResolvedValue({
      available: [],
      pending: [],
    });
  });

  it('renders PPV breakdown when the summary includes it', async () => {
    vi.mocked(monetizationApi.getFinancialSummary).mockResolvedValue({
      currentMonthIncome: 0,
      totalTips: 0,
      breakdown: {
        postUnlocks: 800,
        storyUnlocks: 0,
        messageUnlocks: 0,
        tips: 200,
        liveGifts: 0,
      },
    });

    renderDashboard();

    expect(await screen.findByText('€8.00')).toBeInTheDocument();
    expect(screen.getByText('€2.00')).toBeInTheDocument();
  });

  it('shows Stripe available/pending when Connect is linked', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      user: { stripeConnectAccountId: 'acct_123' },
    } as unknown as ReturnType<typeof useAuthStore>);
    vi.mocked(monetizationApi.getPayouts).mockResolvedValue({
      available: [{ amountCents: 1000, currency: 'EUR' }],
      pending: [{ amountCents: 250, currency: 'EUR' }],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/10\.00/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2\.50/)).toBeInTheDocument();
    expect(screen.queryByText(/Connect with Stripe/i)).not.toBeInTheDocument();
  });

  it('renders transactions returned by the transactions query', async () => {
    vi.mocked(monetizationApi.getMonetization).mockResolvedValue({
      userId: 'user-1',
      lifetimeEarningsCents: 0,
    });
    vi.mocked(monetizationApi.getTransactions).mockResolvedValue({
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
    });

    renderDashboard();

    expect(await screen.findByText('Tip from a fan')).toBeInTheDocument();
    expect(screen.getByText('+€5.00')).toBeInTheDocument();
  });

  it('shows an empty state when there are no transactions', async () => {
    renderDashboard();

    expect(
      await screen.findByText(
        /No transactions yet|Aún no hay transacciones|Sin transacciones/i,
      ),
    ).toBeInTheDocument();
  });
});
