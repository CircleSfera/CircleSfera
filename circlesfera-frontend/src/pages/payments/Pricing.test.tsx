import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentsApi } from '../../services/payments.service';
import { usersApi } from '../../services/users.service';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import Pricing from './Pricing';

vi.mock('../../services/payments.service', () => ({
  paymentsApi: {
    getPlans: vi.fn(),
    getBillingStatus: vi.fn(),
    getBillingPortalUrl: vi.fn(),
    createSubscriptionCheckout: vi.fn(),
  },
}));
vi.mock('../../services/users.service', () => ({
  usersApi: { syncIdentitySession: vi.fn(), createIdentitySession: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  });
  return { toast: t, default: t };
});
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const plan = (
  name: string,
  id: string,
  priceCents: number,
  yearlyPriceCents = 0,
) => ({
  id,
  name,
  currency: 'EUR',
  priceCents,
  yearlyPriceCents,
  features: [],
});
const PLANS = [
  plan('Premium', 'p-premium', 999, 9990),
  plan('Elite Creator', 'p-elite', 1999, 19990),
  plan('Business', 'p-business', 4999),
];

const originalLocation = window.location;
const location = { href: '/' };

describe('Pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.href = '/';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
    vi.mocked(paymentsApi.getPlans).mockResolvedValue(PLANS);
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: false,
    });
    vi.mocked(usersApi.syncIdentitySession).mockResolvedValue({
      status: 'none',
    });
    useAuthStore.setState({
      isAuthenticated: true,
      profile: {
        id: 'p1',
        identityVerifiedAt: '2026-01-01',
        verificationLevel: 'NONE',
      } as never,
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('describes the Premium plan with its own text, not the generic one', async () => {
    const { i18n } = renderWithProviders(<Pricing />);

    expect(await screen.findByText('Premium')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('pricingPage.desc_premium')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('pricingPage.button_premium'),
      }),
    ).toBeInTheDocument();
  });

  it('sends a visitor to sign up instead of checkout', async () => {
    useAuthStore.setState({ isAuthenticated: false, profile: null });
    const { i18n } = renderWithProviders(<Pricing />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('pricingPage.button_premium'),
      }),
    );

    expect(navigate).toHaveBeenCalledWith('/accounts/signup');
    expect(paymentsApi.createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it('opens the monthly or yearly checkout for the chosen plan', async () => {
    vi.mocked(paymentsApi.createSubscriptionCheckout).mockResolvedValue({
      url: 'https://checkout.stripe.com/c/1',
    });
    const { i18n } = renderWithProviders(<Pricing />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('pricingPage.button_premium'),
      }),
    );
    await waitFor(() =>
      expect(paymentsApi.createSubscriptionCheckout).toHaveBeenCalledWith(
        'p-premium',
        'MONTHLY',
      ),
    );
    await waitFor(() =>
      expect(location.href).toBe('https://checkout.stripe.com/c/1'),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('pricingPage.billing_yearly'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('pricingPage.button_elite') }),
    );
    await waitFor(() =>
      expect(paymentsApi.createSubscriptionCheckout).toHaveBeenCalledWith(
        'p-elite',
        'YEARLY',
      ),
    );
  });

  it('a subscriber to a plan manages it in the billing portal instead of paying again', async () => {
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: true,
      subscription: { planName: 'Premium', status: 'ACTIVE' },
    });
    vi.mocked(paymentsApi.getBillingPortalUrl).mockResolvedValue({
      url: 'https://billing.stripe.com/p/1',
    });
    const { i18n } = renderWithProviders(<Pricing />);

    expect(
      await screen.findByText(i18n!.t('pricingPage.current_plan')),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('pricingPage.manage_subscription'),
      }),
    );

    await waitFor(() =>
      expect(location.href).toBe('https://billing.stripe.com/p/1'),
    );
    expect(paymentsApi.createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it('reports a failed checkout', async () => {
    vi.mocked(paymentsApi.createSubscriptionCheckout).mockRejectedValue(
      Object.assign(new Error('x'), { status: 400, data: {} }),
    );
    const { i18n } = renderWithProviders(<Pricing />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('pricingPage.button_business'),
      }),
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(location.href).toBe('/');
  });

  it('shows an error with a retry when the plans cannot be loaded', async () => {
    vi.mocked(paymentsApi.getPlans)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(PLANS);
    const { i18n } = renderWithProviders(<Pricing />);

    expect(
      await screen.findByText(i18n!.t('pricingPage.load_error_title')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('pricingPage.checkout_error')),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('common.try_again') }),
    );

    expect(await screen.findByText('Premium')).toBeInTheDocument();
  });
});
