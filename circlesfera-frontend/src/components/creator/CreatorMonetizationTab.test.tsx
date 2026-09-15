import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import CreatorMonetizationTab from './CreatorMonetizationTab';

vi.mock('../../stores/authStore', () => ({
  useAuthStore: (
    selector: (s: {
      profile: {
        user: { verificationLevel: string };
      };
    }) => unknown,
  ) =>
    selector({
      profile: { user: { verificationLevel: 'BASIC' } },
    }),
}));

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: {
    getMonetization: vi.fn().mockResolvedValue({
      hasStripeAccount: true,
      lifetimeEarningsCents: 1250,
    }),
    getStatus: vi.fn().mockResolvedValue({
      connected: true,
      transfersEnabled: true,
    }),
    connectAccount: vi.fn(),
    getDashboardLink: vi.fn(),
  },
}));

vi.mock('../../services/payments.service', () => ({
  paymentsApi: {
    getPlans: vi.fn().mockResolvedValue([
      {
        id: 'plan-1',
        name: 'Premium',
        priceCents: 999,
        currency: 'EUR',
        interval: 'month',
        features: ['feature_one'],
      },
    ]),
    getBillingStatus: vi.fn().mockResolvedValue({
      hasActiveSubscription: false,
    }),
    createSubscriptionCheckout: vi.fn(),
    getBillingPortalUrl: vi.fn(),
  },
}));

vi.mock('../monetization/MonetizationDashboard', () => ({
  default: () => <div data-testid="monetization-dashboard" />,
}));

vi.mock('./CreatorPpvIncome', () => ({
  default: () => <div data-testid="ppv-income" />,
}));

describe('CreatorMonetizationTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Stripe and plan chrome from the catalog, not Spanish fallbacks', async () => {
    const { i18n } = renderWithProviders(
      <CreatorMonetizationTab onToast={vi.fn()} />,
    );

    expect(
      await screen.findByText(i18n!.t('creator.monetization.stripe_connected')),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.monetization.lifetime')).toBe('Lifetime earnings');
    expect(
      screen.getByText(i18n!.t('creator.monetization.lifetime')),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        i18n!.t('creator.monetization.transfers_enabled'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: new RegExp(i18n!.t('creator.monetization.express_dashboard')),
      }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        i18n!.t('creator.monetization.current_plan', {
          plan: i18n!.t('creator.monetization.free_plan'),
        }),
      ),
    ).toBeInTheDocument();
    expect(i18n!.t('creator.monetization.upgrade_now')).toBe('Upgrade Now');
    expect(
      screen.getByRole('button', {
        name: i18n!.t('creator.monetization.upgrade_now'),
      }),
    ).toBeInTheDocument();

    expect(screen.queryByText('Ganancias de por vida')).not.toBeInTheDocument();
    expect(screen.queryByText('Mejorar Ahora')).not.toBeInTheDocument();
    expect(screen.queryByText('Experiencia Gratuita')).not.toBeInTheDocument();
  });

  it('exposes Stripe error keys in the creator monetization catalog', () => {
    const { i18n } = renderWithProviders(
      <CreatorMonetizationTab onToast={vi.fn()} section="plans" />,
    );

    expect(i18n!.t('creator.monetization.error_connect')).toBe(
      'Error connecting to Stripe',
    );
    expect(i18n!.t('creator.monetization.error_dashboard')).toBe(
      'Error opening dashboard',
    );
  });
});
