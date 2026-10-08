import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monetizationApi } from '../../services/monetization.service';
import { paymentsApi } from '../../services/payments.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorMonetizationTab from './CreatorMonetizationTab';

const auth = vi.hoisted(() => ({ verificationLevel: undefined as unknown }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ profile: { verificationLevel: auth.verificationLevel } }),
}));

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: {
    getMonetization: vi.fn(),
    getStatus: vi.fn(),
    connectAccount: vi.fn(),
    getDashboardLink: vi.fn(),
  },
}));

vi.mock('../../services/payments.service', () => ({
  paymentsApi: {
    getPlans: vi.fn(),
    getBillingStatus: vi.fn(),
    createSubscriptionCheckout: vi.fn(),
    getBillingPortalUrl: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  });
  return { toast: t, default: t };
});

vi.mock('../monetization/MonetizationDashboard', () => ({
  default: () => <div data-testid="monetization-dashboard" />,
}));

vi.mock('./CreatorPpvIncome', () => ({
  default: ({
    onConnect,
    showConnect,
  }: {
    onConnect: () => void;
    showConnect?: boolean;
  }) => (
    <div data-testid="ppv-income">
      {showConnect && (
        <button type="button" onClick={onConnect}>
          connect stripe
        </button>
      )}
    </div>
  ),
}));

const plan = (name: string, id: string, priceCents: number) => ({
  id,
  name,
  priceCents,
  currency: 'EUR',
  interval: 'month',
  features: ['feature_one'],
});

// The shape the API client rejects with: server text in English.
const serverError = (message: string, status = 400) =>
  Object.assign(new Error(message), { status, data: { message } });

const originalLocation = window.location;
const location = { href: '/', origin: 'https://circlesfera.test' };

describe('CreatorMonetizationTab', () => {
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    auth.verificationLevel = undefined;
    location.href = '/';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
    vi.mocked(monetizationApi.getMonetization).mockResolvedValue({
      hasStripeAccount: true,
      lifetimeEarningsCents: 1250,
    });
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: true,
      transfersEnabled: true,
    });
    vi.mocked(paymentsApi.getPlans).mockResolvedValue([
      plan('Verified', 'plan-1', 999),
    ] as never);
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      hasActiveSubscription: false,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders Stripe and plan chrome from the catalog, not Spanish fallbacks', async () => {
    const { i18n } = renderWithProviders(
      <CreatorMonetizationTab onToast={onToast} />,
    );

    expect(
      await screen.findByText(i18n!.t('creator.monetization.stripe_connected')),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.monetization.lifetime')).toBe('Lifetime earnings');
    expect(screen.getByText('€12.50')).toBeInTheDocument();
    expect(
      await screen.findByText(
        i18n!.t('creator.monetization.transfers_enabled'),
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        i18n!.t('creator.monetization.current_plan', {
          plan: i18n!.t('creator.monetization.free_plan'),
        }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('€9.99')).toBeInTheDocument();
    expect(screen.getByText('feature one')).toBeInTheDocument();
    expect(i18n!.t('creator.monetization.upgrade_now')).toBe('Upgrade Now');
    expect(screen.queryByText('Ganancias de por vida')).not.toBeInTheDocument();
    expect(screen.queryByText('Mejorar Ahora')).not.toBeInTheDocument();
  });

  it('writes earnings and plan prices as currency in Spanish', async () => {
    renderWithProviders(<CreatorMonetizationTab onToast={onToast} />, {
      lng: 'es',
    });

    expect(await screen.findByText(/^12,50\s€$/)).toBeInTheDocument();
    expect(await screen.findByText(/^9,99\s€$/)).toBeInTheDocument();
  });

  it('names the plan features in the app language', async () => {
    vi.mocked(paymentsApi.getPlans).mockResolvedValue([
      {
        ...plan('Premium', 'plan-1', 999),
        features: ['verified_badge', 'priority_support'],
      },
    ] as never);
    renderWithProviders(
      <CreatorMonetizationTab onToast={onToast} section="plans" />,
      { lng: 'es' },
    );

    expect(
      await screen.findByText('Insignia de verificación'),
    ).toBeInTheDocument();
    expect(screen.getByText('Soporte prioritario')).toBeInTheDocument();
  });

  it('shows only income or only plans when asked', async () => {
    const income = renderWithProviders(
      <CreatorMonetizationTab onToast={onToast} section="income" />,
    );
    expect(
      await screen.findByTestId('monetization-dashboard'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        income.i18n!.t('creator.monetization.subscription_status'),
      ),
    ).not.toBeInTheDocument();
    expect(paymentsApi.getPlans).not.toHaveBeenCalled();
    income.unmount();

    const plans = renderWithProviders(
      <CreatorMonetizationTab onToast={onToast} section="plans" />,
    );
    expect(
      await screen.findByText(
        plans.i18n!.t('creator.monetization.subscription_status'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('monetization-dashboard'),
    ).not.toBeInTheDocument();
  });

  it('says transfers are pending until Stripe enables them', async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: true,
      transfersEnabled: false,
    });
    const { i18n } = renderWithProviders(
      <CreatorMonetizationTab onToast={onToast} section="income" />,
    );

    expect(
      await screen.findByText(
        i18n!.t('creator.monetization.transfers_pending'),
      ),
    ).toBeInTheDocument();
  });

  it('thanks for connecting Stripe on return and cleans the address', async () => {
    const { i18n } = renderWithProviders(
      <CreatorMonetizationTab onToast={onToast} section="income" />,
      {
        routerProps: {
          useTransitions: false,
          initialEntries: ['/creator/monetization?connect_success=true'],
        },
      },
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('creator.income.connect_success'),
      ),
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  describe('connecting Stripe', () => {
    beforeEach(() => {
      vi.mocked(monetizationApi.getMonetization).mockResolvedValue({
        hasStripeAccount: false,
      });
    });

    it('opens the Stripe onboarding with the return addresses of this page', async () => {
      vi.mocked(monetizationApi.connectAccount).mockResolvedValue({
        url: 'https://connect.stripe.com/setup',
      });
      const { i18n } = renderWithProviders(
        <CreatorMonetizationTab onToast={onToast} section="income" />,
      );

      fireEvent.click(
        await screen.findByRole('button', { name: 'connect stripe' }),
      );

      await waitFor(() =>
        expect(location.href).toBe('https://connect.stripe.com/setup'),
      );
      expect(monetizationApi.connectAccount).toHaveBeenCalledWith(
        'https://circlesfera.test/creator/monetization?connect_success=true',
        'https://circlesfera.test/creator/monetization',
      );
      expect(
        screen.queryByText(i18n!.t('creator.monetization.stripe_connected')),
      ).not.toBeInTheDocument();
      expect(monetizationApi.getStatus).not.toHaveBeenCalled();
    });

    it('explains a failed connection in the app language', async () => {
      vi.mocked(monetizationApi.connectAccount).mockRejectedValue(
        serverError('Stripe account could not be created'),
      );
      const { i18n } = renderWithProviders(
        <CreatorMonetizationTab onToast={onToast} section="income" />,
      );

      fireEvent.click(
        await screen.findByRole('button', { name: 'connect stripe' }),
      );

      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          i18n!.t('creator.monetization.error_connect'),
          'error',
        ),
      );
      expect(location.href).toBe('/');
    });

    it('offers to verify the identity when Stripe cannot be connected for it', async () => {
      vi.mocked(monetizationApi.connectAccount).mockRejectedValue(
        serverError(
          'Debes verificar tu identidad primero para poder comprar o cobrar.',
          403,
        ),
      );
      const { i18n } = renderWithProviders(
        <CreatorMonetizationTab onToast={onToast} section="income" />,
      );

      fireEvent.click(
        await screen.findByRole('button', { name: 'connect stripe' }),
      );

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.any(Function),
          expect.anything(),
        ),
      );
      expect(onToast).not.toHaveBeenCalled();
      expect(i18n!.t('pricingPage.verify_button')).toBeTruthy();
    });

    it('stays on the page when Stripe answers with no address', async () => {
      vi.mocked(monetizationApi.connectAccount).mockResolvedValue({});
      renderWithProviders(
        <CreatorMonetizationTab onToast={onToast} section="income" />,
      );

      fireEvent.click(
        await screen.findByRole('button', { name: 'connect stripe' }),
      );

      await waitFor(() =>
        expect(monetizationApi.connectAccount).toHaveBeenCalled(),
      );
      expect(location.href).toBe('/');
    });
  });

  describe('Stripe dashboard', () => {
    it('opens the Stripe dashboard in a new tab', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      vi.mocked(monetizationApi.getDashboardLink).mockResolvedValue({
        url: 'https://connect.stripe.com/express',
      });
      const { i18n } = renderWithProviders(
        <CreatorMonetizationTab onToast={onToast} section="income" />,
      );

      fireEvent.click(
        await screen.findByRole('button', {
          name: new RegExp(i18n!.t('creator.monetization.express_dashboard')),
        }),
      );

      await waitFor(() =>
        expect(open).toHaveBeenCalledWith(
          'https://connect.stripe.com/express',
          '_blank',
        ),
      );
      open.mockRestore();
    });

    it('explains in the app language when the dashboard cannot be opened', async () => {
      vi.mocked(monetizationApi.getDashboardLink).mockRejectedValue(
        serverError('No such account'),
      );
      const { i18n } = renderWithProviders(
        <CreatorMonetizationTab onToast={onToast} section="income" />,
      );

      fireEvent.click(
        await screen.findByRole('button', {
          name: new RegExp(i18n!.t('creator.monetization.express_dashboard')),
        }),
      );

      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          i18n!.t('creator.monetization.error_dashboard'),
          'error',
        ),
      );
    });
  });

  describe('plans', () => {
    const renderPlans = () =>
      renderWithProviders(
        <CreatorMonetizationTab onToast={onToast} section="plans" />,
      );

    it('starts the checkout of the chosen plan', async () => {
      vi.mocked(paymentsApi.createSubscriptionCheckout).mockResolvedValue({
        url: 'https://checkout.stripe.com/plan',
      });
      const { i18n } = renderPlans();

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('creator.monetization.upgrade_now'),
        }),
      );

      await waitFor(() =>
        expect(location.href).toBe('https://checkout.stripe.com/plan'),
      );
      expect(paymentsApi.createSubscriptionCheckout).toHaveBeenCalledWith(
        'plan-1',
      );
    });

    it('explains a failed checkout in the app language', async () => {
      vi.mocked(paymentsApi.createSubscriptionCheckout).mockRejectedValue(
        serverError('Plan is not available'),
      );
      const { i18n } = renderPlans();

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('creator.monetization.upgrade_now'),
        }),
      );

      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          i18n!.t('creator.monetization.error_checkout'),
          'error',
        ),
      );
      expect(onToast).not.toHaveBeenCalledWith(
        'Plan is not available',
        'error',
      );
    });

    it('offers to verify the identity when the checkout is refused for it', async () => {
      vi.mocked(paymentsApi.createSubscriptionCheckout).mockRejectedValue(
        serverError(
          'Debes verificar tu identidad primero para poder comprar o cobrar.',
          403,
        ),
      );
      const { i18n } = renderPlans();

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('creator.monetization.upgrade_now'),
        }),
      );

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.any(Function),
          expect.anything(),
        ),
      );
      expect(onToast).not.toHaveBeenCalled();
      expect(i18n!.t('pricingPage.verify_button')).toBeTruthy();
    });

    it('asks a free account to pick a plan instead of opening the billing portal', async () => {
      const { i18n } = renderPlans();

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('creator.monetization.manage_subscription'),
        }),
      );

      expect(onToast).toHaveBeenCalledWith(
        i18n!.t('creator.monetization.select_plan_start'),
        'success',
      );
      expect(paymentsApi.getBillingPortalUrl).not.toHaveBeenCalled();
    });

    it('marks the subscribed plan as active and opens the billing portal', async () => {
      vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
        hasActiveSubscription: true,
        subscription: { planName: 'Verified Monthly' },
      });
      vi.mocked(paymentsApi.getBillingPortalUrl).mockResolvedValue({
        url: 'https://billing.stripe.com/portal',
      });
      const { i18n } = renderPlans();

      expect(
        await screen.findByText(i18n!.t('creator.monetization.active')),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          i18n!.t('creator.monetization.current_plan', {
            plan: 'Verified Monthly',
          }),
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: i18n!.t('creator.monetization.upgrade_now'),
        }),
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('creator.monetization.manage_subscription'),
        }),
      );

      await waitFor(() =>
        expect(location.href).toBe('https://billing.stripe.com/portal'),
      );
    });

    it('explains in the app language when the billing portal cannot be opened', async () => {
      auth.verificationLevel = 'ELITE';
      vi.mocked(paymentsApi.getBillingPortalUrl).mockRejectedValue(
        serverError('No customer'),
      );
      const { i18n } = renderPlans();

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('creator.monetization.manage_subscription'),
        }),
      );

      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          i18n!.t('creator.monetization.error_portal'),
          'error',
        ),
      );
    });

    it.each([
      ['VERIFIED', 'Premium'],
      ['ELITE', 'Elite Creator'],
      ['BUSINESS', 'Business'],
    ])(
      'marks the plan of a %s account as active, and only that one',
      async (level, planName) => {
        auth.verificationLevel = level;
        vi.mocked(paymentsApi.getPlans).mockResolvedValue([
          plan('Premium', 'p1', 999),
          plan('Elite Creator', 'p2', 1999),
          plan('Business', 'p3', 4999),
          { ...plan('Studio', 'p4', 2999), interval: 'year' },
        ] as never);
        const { i18n } = renderPlans();

        await screen.findByText(planName);
        expect(
          screen.getAllByText(i18n!.t('creator.monetization.active')),
        ).toHaveLength(1);
        expect(
          screen.getAllByRole('button', {
            name: i18n!.t('creator.monetization.upgrade_now'),
          }),
        ).toHaveLength(3);
        expect(
          screen.getByText(
            i18n!.t('creator.monetization.current_plan', { plan: level }),
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByText(i18n!.t('creator.monetization.per_year')),
        ).toBeInTheDocument();
      },
    );

    it('stays on the page when checkout or portal answer with no address', async () => {
      auth.verificationLevel = 'ELITE';
      vi.mocked(paymentsApi.createSubscriptionCheckout).mockResolvedValue({});
      vi.mocked(paymentsApi.getBillingPortalUrl).mockResolvedValue({});
      const { i18n } = renderPlans();

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('creator.monetization.upgrade_now'),
        }),
      );
      await waitFor(() =>
        expect(paymentsApi.createSubscriptionCheckout).toHaveBeenCalled(),
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('creator.monetization.manage_subscription'),
        }),
      );
      await waitFor(() =>
        expect(paymentsApi.getBillingPortalUrl).toHaveBeenCalled(),
      );

      expect(location.href).toBe('/');
      expect(onToast).not.toHaveBeenCalled();
    });
  });
});
