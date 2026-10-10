import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import SubscriptionsTab from './SubscriptionsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: { getSubscriptions: vi.fn(), getPlans: vi.fn() },
}));

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: 's-1',
  status: 'ACTIVE',
  stripeSubscriptionId: 'sub_123',
  currentPeriodEnd: '2026-11-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  plan: { id: 'plan-1', name: 'Premium', priceCents: 999, currency: 'EUR' },
  profile: { id: 'p-1', username: 'ana', fullName: 'Ana Ruiz', avatar: null },
  user: { id: 'u-1', email: 'ana@example.com' },
  ...overrides,
});
const list = (data: unknown[]) => ({
  data: {
    data,
    meta: { page: 1, limit: 20, total: data.length, totalPages: 1 },
  },
});

describe('SubscriptionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getPlans).mockResolvedValue({
      data: {
        plans: [{ id: 'plan-1', name: 'Premium' }],
        featureKeys: [],
      },
    } as never);
  });

  it('shows who has the plan, its state and when it renews', async () => {
    vi.mocked(adminApi.getSubscriptions).mockResolvedValue(
      list([subscription()]) as never,
    );
    renderWithProviders(<SubscriptionsTab />);

    expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('Active', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText(/Premium ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Renews on/)).toBeInTheDocument();
  });

  it('says when a subscription in force ends at period end', async () => {
    vi.mocked(adminApi.getSubscriptions).mockResolvedValue(
      list([subscription({ cancelAtPeriodEnd: true })]) as never,
    );
    renderWithProviders(<SubscriptionsTab />);

    expect(await screen.findByText(/^Ends on/)).toBeInTheDocument();
    expect(screen.queryByText(/^Renews on/)).not.toBeInTheDocument();
  });

  it('links each row to the payment provider and offers no other action', async () => {
    vi.mocked(adminApi.getSubscriptions).mockResolvedValue(
      list([subscription()]) as never,
    );
    renderWithProviders(<SubscriptionsTab />);

    const link = await screen.findByRole('link', { name: /Open in Stripe/ });
    expect(link).toHaveAttribute(
      'href',
      'https://dashboard.stripe.com/subscriptions/sub_123',
    );
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: /cancel|refund/i })).toBeNull();
  });

  it('keeps the row of a deleted account', async () => {
    vi.mocked(adminApi.getSubscriptions).mockResolvedValue(
      list([
        subscription({ status: 'EXPIRED', profile: null, user: null }),
      ]) as never,
    );
    renderWithProviders(<SubscriptionsTab />);

    expect(await screen.findByText('Deleted account')).toBeInTheDocument();
    expect(screen.getByText(/^Period until/)).toBeInTheDocument();
  });

  it('asks the server again when a state is chosen', async () => {
    vi.mocked(adminApi.getSubscriptions).mockResolvedValue(list([]) as never);
    renderWithProviders(<SubscriptionsTab />);
    await screen.findByText('No subscriptions');

    fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
      target: { value: 'PAST_DUE' },
    });

    await waitFor(() =>
      expect(adminApi.getSubscriptions).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'PAST_DUE', page: 1 }),
      ),
    );
  });
});
