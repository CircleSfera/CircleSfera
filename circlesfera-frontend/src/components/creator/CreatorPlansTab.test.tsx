import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentsApi } from '../../services/payments.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorPlansTab from './CreatorPlansTab';

const sells = vi.hoisted(() => ({ value: true }));
vi.mock('../../utils/sellsInApp', () => ({ sellsInApp: () => sells.value }));

vi.mock('../payments/WithdrawalConsent', async () =>
  (await import('../../test/withdrawalConsentGiven')).withdrawalConsentGiven(),
);

const auth = vi.hoisted(() => ({ verificationLevel: undefined as unknown }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ profile: { verificationLevel: auth.verificationLevel } }),
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

describe('CreatorPlansTab', () => {
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    auth.verificationLevel = undefined;
    location.href = '/';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
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

  it('renders the plan chrome from the catalog, not Spanish fallbacks', async () => {
    const { i18n } = renderWithProviders(<CreatorPlansTab onToast={onToast} />);

    expect(
      await screen.findByText(
        i18n!.t('creator.plans.current_plan', {
          plan: i18n!.t('creator.plans.free_plan'),
        }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('€9.99')).toBeInTheDocument();
    expect(screen.getByText('feature one')).toBeInTheDocument();
    expect(i18n!.t('creator.plans.upgrade_now')).toBe('Choose this plan');
    expect(screen.queryByText('Mejorar Ahora')).not.toBeInTheDocument();
  });

  it('in the apps offers no plan to buy', async () => {
    sells.value = false;
    const { i18n } = renderWithProviders(<CreatorPlansTab onToast={onToast} />);

    expect(await screen.findByText('€9.99')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('creator.plans.upgrade_now'),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(i18n!.t('pricingPage.not_in_app')).length,
    ).toBeGreaterThan(0);
    sells.value = true;
  });

  it('writes plan prices as currency in Spanish', async () => {
    renderWithProviders(<CreatorPlansTab onToast={onToast} />, {
      lng: 'es',
    });

    expect(await screen.findByText(/^9,99\s€$/)).toBeInTheDocument();
  });

  it('names the plan features in the app language', async () => {
    vi.mocked(paymentsApi.getPlans).mockResolvedValue([
      {
        ...plan('Premium', 'plan-1', 999),
        features: ['verified_badge', 'priority_support'],
      },
    ] as never);
    renderWithProviders(<CreatorPlansTab onToast={onToast} />, { lng: 'es' });

    expect(
      await screen.findByText('Insignia de verificación'),
    ).toBeInTheDocument();
    expect(screen.getByText('Soporte prioritario')).toBeInTheDocument();
  });

  describe('plans', () => {
    const renderPlans = () =>
      renderWithProviders(<CreatorPlansTab onToast={onToast} />);

    it('starts the checkout of the chosen plan', async () => {
      vi.mocked(paymentsApi.createSubscriptionCheckout).mockResolvedValue({
        url: 'https://checkout.stripe.com/plan',
      });
      const { i18n } = renderPlans();

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('creator.plans.upgrade_now'),
        }),
      );

      await waitFor(() =>
        expect(location.href).toBe('https://checkout.stripe.com/plan'),
      );
      expect(paymentsApi.createSubscriptionCheckout).toHaveBeenCalledWith(
        'plan-1',
        'MONTHLY',
        { withdrawalConsent: true },
      );
    });

    it('says under each price that it includes VAT', async () => {
      const { i18n } = renderPlans();
      const buttons = await screen.findAllByRole('button', {
        name: i18n!.t('creator.plans.upgrade_now'),
      });

      expect(screen.getAllByText('VAT included')).toHaveLength(buttons.length);
    });

    it('explains a failed checkout in the app language', async () => {
      vi.mocked(paymentsApi.createSubscriptionCheckout).mockRejectedValue(
        serverError('Plan is not available'),
      );
      const { i18n } = renderPlans();

      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n!.t('creator.plans.upgrade_now'),
        }),
      );

      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          i18n!.t('creator.plans.error_checkout'),
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
          name: i18n!.t('creator.plans.upgrade_now'),
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
          name: i18n!.t('creator.plans.manage_subscription'),
        }),
      );

      expect(onToast).toHaveBeenCalledWith(
        i18n!.t('creator.plans.select_plan_start'),
        'success',
      );
      expect(paymentsApi.getBillingPortalUrl).not.toHaveBeenCalled();
    });

    it('marks the subscribed plan as active and opens the billing portal', async () => {
      vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
        hasActiveSubscription: true,
        subscription: { planName: 'Verified' },
      });
      vi.mocked(paymentsApi.getBillingPortalUrl).mockResolvedValue({
        url: 'https://billing.stripe.com/portal',
      });
      const { i18n } = renderPlans();

      expect(
        await screen.findByText(i18n!.t('creator.plans.active')),
      ).toBeInTheDocument();
      // The plan's card and the current-plan line both name it.
      expect(
        screen.getAllByText(
          i18n!.t('creator.plans.current_plan', {
            plan: 'Verified',
          }),
        ),
      ).toHaveLength(2);
      expect(
        screen.queryByRole('button', {
          name: i18n!.t('creator.plans.upgrade_now'),
        }),
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('creator.plans.manage_subscription'),
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
          name: i18n!.t('creator.plans.manage_subscription'),
        }),
      );

      await waitFor(() =>
        expect(onToast).toHaveBeenCalledWith(
          i18n!.t('creator.plans.error_portal'),
          'error',
        ),
      );
    });

    // The Verified and Premium plans both give the VERIFIED level, the badge:
    // without a subscription saying which, it stands for Verified.
    it.each([
      ['VERIFIED', 'Verified'],
      ['ELITE', 'Elite Creator'],
      ['BUSINESS', 'Business'],
    ])(
      'marks the plan of a %s account as active, and only that one',
      async (level, planName) => {
        auth.verificationLevel = level;
        vi.mocked(paymentsApi.getPlans).mockResolvedValue([
          plan('Verified', 'p0', 499),
          plan('Premium', 'p1', 999),
          plan('Elite Creator', 'p2', 1999),
          plan('Business', 'p3', 4999),
          { ...plan('Studio', 'p4', 2999), interval: 'year' },
        ] as never);
        const { i18n } = renderPlans();

        await screen.findAllByText(planName);
        expect(
          screen.getAllByText(i18n!.t('creator.plans.active')),
        ).toHaveLength(1);
        expect(
          screen.getAllByRole('button', {
            name: i18n!.t('creator.plans.upgrade_now'),
          }),
        ).toHaveLength(4);
        expect(
          screen.getByText(
            i18n!.t('creator.plans.current_plan', { plan: level }),
          ),
        ).toBeInTheDocument();
        expect(
          screen.getByText(i18n!.t('creator.plans.per_year')),
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
          name: i18n!.t('creator.plans.upgrade_now'),
        }),
      );
      await waitFor(() =>
        expect(paymentsApi.createSubscriptionCheckout).toHaveBeenCalled(),
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('creator.plans.manage_subscription'),
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
