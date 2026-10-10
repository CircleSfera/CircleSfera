import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import DisputesTab from './DisputesTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: { getDisputes: vi.fn() },
}));

const inDays = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const dispute = (overrides: Record<string, unknown> = {}) => ({
  id: 'd-1',
  stripeDisputeId: 'dp_123',
  amountCents: 1999,
  currency: 'EUR',
  reason: 'fraudulent',
  status: 'needs_response',
  evidenceDueBy: inDays(2),
  openedAt: '2026-10-01T00:00:00.000Z',
  closedAt: null,
  transaction: {
    id: 'tx-1',
    type: 'TIP',
    sender: { id: 'u-1', email: 'ana@example.com' },
  },
  ...overrides,
});
const list = (data: unknown[]) => ({
  data: {
    data,
    meta: {
      page: 1,
      limit: 20,
      total: data.length,
      totalPages: 1,
      openCount: data.length,
    },
  },
});

describe('DisputesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on the open disputes', async () => {
    vi.mocked(adminApi.getDisputes).mockResolvedValue(list([]) as never);
    renderWithProviders(<DisputesTab />);

    expect(await screen.findByText('No open disputes')).toBeInTheDocument();
    expect(adminApi.getDisputes).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'open' }),
    );
  });

  it('shows the amount, the reason, the state and the days left to answer', async () => {
    vi.mocked(adminApi.getDisputes).mockResolvedValue(
      list([dispute()]) as never,
    );
    renderWithProviders(<DisputesTab />);

    expect(await screen.findByText(/19[.,]99/)).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('Needs response')).toBeInTheDocument();
    expect(
      screen.getByText('Payment not recognised (fraud)'),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 days left/)).toBeInTheDocument();
  });

  it('links an open dispute to the provider to answer it', async () => {
    vi.mocked(adminApi.getDisputes).mockResolvedValue(
      list([dispute()]) as never,
    );
    renderWithProviders(<DisputesTab />);

    const link = await screen.findByRole('link', { name: /Answer in Stripe/ });
    expect(link).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/disputes/dp_123',
    );
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows a closed dispute with no deadline, and a reason it does not know as received', async () => {
    vi.mocked(adminApi.getDisputes).mockResolvedValue(
      list([
        dispute({
          status: 'lost',
          reason: 'bank_cannot_process',
          evidenceDueBy: null,
          closedAt: '2026-10-05T00:00:00.000Z',
          transaction: null,
        }),
      ]) as never,
    );
    renderWithProviders(<DisputesTab />);

    expect(await screen.findByText('Lost')).toBeInTheDocument();
    expect(screen.getByText('bank_cannot_process')).toBeInTheDocument();
    expect(screen.getByText('Payment of a plan')).toBeInTheDocument();
    expect(screen.queryByText(/Answer before/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Stripe/ })).toBeVisible();
  });

  it('says when the deadline has passed', async () => {
    vi.mocked(adminApi.getDisputes).mockResolvedValue(
      list([dispute({ evidenceDueBy: inDays(-2) })]) as never,
    );
    renderWithProviders(<DisputesTab />);

    expect(
      await screen.findByText(/The deadline ended on/),
    ).toBeInTheDocument();
  });

  it('asks for every dispute when "All" is chosen', async () => {
    vi.mocked(adminApi.getDisputes).mockResolvedValue(list([]) as never);
    renderWithProviders(<DisputesTab />);
    await screen.findByText('No open disputes');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() =>
      expect(adminApi.getDisputes).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: undefined, page: 1 }),
      ),
    );
  });
});
