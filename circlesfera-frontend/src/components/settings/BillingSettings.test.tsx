import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentsApi } from '../../services/payments.service';
import { renderWithProviders } from '../../test/test-utils';
import BillingSettings from './BillingSettings';

vi.mock('../../services/payments.service', () => ({
  paymentsApi: { getBillingStatus: vi.fn(), getBillingPortalUrl: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const originalLocation = window.location;
const location = { href: '/' };

describe('BillingSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.href = '/';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('a free account sees the free plan and goes to the plans page', async () => {
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: false,
    });
    const { i18n } = renderWithProviders(<BillingSettings />);

    expect(
      await screen.findByText(i18n!.t('settings.billing.free')),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.billing.view_plans'),
      }),
    );
    expect(navigate).toHaveBeenCalledWith('/pricing');
    expect(paymentsApi.getBillingPortalUrl).not.toHaveBeenCalled();
  });

  it('a subscriber sees the plan, its renewal and opens the billing portal', async () => {
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: true,
      subscription: {
        planName: 'Premium',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-11-06T00:00:00.000Z',
        cancelAtPeriodEnd: false,
      },
    });
    vi.mocked(paymentsApi.getBillingPortalUrl).mockResolvedValue({
      url: 'https://billing.stripe.com/session/x',
    });
    const { i18n } = renderWithProviders(<BillingSettings />);

    expect(await screen.findByText('Premium')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('settings.billing.renews_on'), { exact: false }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('settings.billing.manage') }),
    );

    await waitFor(() =>
      expect(location.href).toBe('https://billing.stripe.com/session/x'),
    );
  });

  it('says when a cancelled subscription ends', async () => {
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: true,
      subscription: {
        planName: 'Premium',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-11-06T00:00:00.000Z',
        cancelAtPeriodEnd: true,
      },
    });
    const { i18n } = renderWithProviders(<BillingSettings />);

    expect(
      await screen.findByText(i18n!.t('settings.billing.cancels_on'), {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it('reports a portal failure and stays on the page', async () => {
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: true,
      subscription: { planName: 'Premium', status: 'ACTIVE' },
    });
    vi.mocked(paymentsApi.getBillingPortalUrl).mockRejectedValue(
      new Error('stripe down'),
    );
    const { i18n } = renderWithProviders(<BillingSettings />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.billing.manage'),
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('settings.billing.portal_error'),
      ),
    );
    expect(location.href).toBe('/');
  });

  it.each([
    ['ACTIVE', 'status_active'],
    ['TRIALING', 'status_trialing'],
    ['PAST_DUE', 'status_past_due'],
    ['INCOMPLETE', 'status_incomplete'],
    ['CANCELLED', 'status_cancelled'],
    ['EXPIRED', 'status_expired'],
  ])('shows the %s status in the app language', async (status, key) => {
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: status === 'ACTIVE',
      subscription: { planName: 'Premium', status },
    });
    const { i18n } = renderWithProviders(<BillingSettings />, { lng: 'es' });

    expect(
      await screen.findByText(i18n!.t(`settings.billing.${key}`)),
    ).toBeInTheDocument();
    expect(screen.queryByText(status)).not.toBeInTheDocument();
  });

  it('writes the renewal date in the app language', async () => {
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: true,
      subscription: {
        planName: 'Premium',
        status: 'ACTIVE',
        currentPeriodEnd: '2026-11-06T12:00:00.000Z',
        cancelAtPeriodEnd: false,
      },
    });
    renderWithProviders(<BillingSettings />, { lng: 'es' });

    expect(
      await screen.findByText(/6 de noviembre de 2026/),
    ).toBeInTheDocument();
  });
});
