import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { helpCentreApi } from '../../services/helpCentre.service';
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
vi.mock('../../services/helpCentre.service', () => ({
  helpCentreApi: { article: vi.fn() },
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
    vi.mocked(helpCentreApi.article).mockRejectedValue(new Error('down'));
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

  it('answers the questions asked before paying with their articles of the help centre, in its own order', async () => {
    const titles: Record<string, string> = {
      'what-plans-unlock': 'What do the plans unlock?',
      'is-circlesfera-free': 'Is CircleSfera free?',
    };
    // Each article is asked for by its address, so it shows however many
    // others the help centre holds. One of the three is not published.
    vi.mocked(helpCentreApi.article).mockImplementation(((slug: string) =>
      titles[slug]
        ? Promise.resolve({
            data: { slug, topic: 'PAYMENTS', title: titles[slug] },
          })
        : Promise.reject(new Error('not found'))) as never);
    const { i18n } = renderWithProviders(<Pricing />);

    const free = await screen.findByRole('link', {
      name: 'Is CircleSfera free?',
    });
    const plans = screen.getByRole('link', {
      name: 'What do the plans unlock?',
    });
    expect(free).toHaveAttribute('href', '/help/is-circlesfera-free');
    expect(
      free.compareDocumentPosition(plans) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      vi.mocked(helpCentreApi.article).mock.calls.map(([slug]) => slug),
    ).toEqual([
      'is-circlesfera-free',
      'what-plans-unlock',
      'identity-verification',
    ]);
    expect(
      screen.getByRole('link', { name: i18n!.t('pricingPage.all_questions') }),
    ).toHaveAttribute('href', '/help');
  });

  it('keeps the way to all the questions when the help centre does not answer', async () => {
    const { i18n } = renderWithProviders(<Pricing />);

    expect(
      await screen.findByRole('link', {
        name: i18n!.t('pricingPage.all_questions'),
      }),
    ).toHaveAttribute('href', '/help');
    expect(
      screen.queryByRole('link', { name: /free/i }),
    ).not.toBeInTheDocument();
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

  it('writes the prices as currency in the app language and in the plan currency', async () => {
    vi.mocked(paymentsApi.getPlans).mockResolvedValue([
      plan('Premium', 'p-premium', 999),
      { ...plan('Business', 'p-business', 4999), currency: 'USD' },
    ]);
    renderWithProviders(<Pricing />, { lng: 'es' });

    expect(await screen.findByText(/^9,99\s€$/)).toBeInTheDocument();
    expect(screen.getByText(/^49,99\sUS\$$/)).toBeInTheDocument();
  });

  it('shows the yearly price with its saving and keeps a plan without yearly price from being bought yearly', async () => {
    const { i18n } = renderWithProviders(<Pricing />);
    await screen.findByText('Premium');

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('pricingPage.billing_yearly'),
      }),
    );

    expect(screen.getByText('€99.90')).toBeInTheDocument();
    // 99.90 a year against 9.99 a month is 17 % less.
    expect(
      screen.getAllByText(i18n!.t('pricingPage.save_percent', { percent: 17 }))
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', {
        name: i18n!.t('pricingPage.button_business'),
      }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('pricingPage.billing_monthly'),
      }),
    );
    expect(screen.getByText('€9.99')).toBeInTheDocument();
  });

  it('hides the billing cycle choice when no plan has a yearly price', async () => {
    vi.mocked(paymentsApi.getPlans).mockResolvedValue([
      plan('Premium', 'p-premium', 999),
    ]);
    const { i18n } = renderWithProviders(<Pricing />);
    await screen.findByText('Premium');

    expect(
      screen.queryByRole('button', {
        name: i18n!.t('pricingPage.billing_yearly'),
      }),
    ).not.toBeInTheDocument();
  });

  it('marks the plan that matches the verification level as the current one', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      profile: {
        id: 'p1',
        identityVerifiedAt: '2026-01-01',
        verificationLevel: 'ELITE',
      } as never,
    });
    vi.mocked(paymentsApi.getBillingPortalUrl).mockResolvedValue({
      url: 'https://billing.stripe.com/portal',
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
      expect(location.href).toBe('https://billing.stripe.com/portal'),
    );
    expect(paymentsApi.createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it('gives an unknown plan a generic text and button, and lists its features', async () => {
    vi.mocked(paymentsApi.getPlans).mockResolvedValue([
      {
        ...plan('Studio', 'p-studio', 2999),
        features: ['priority_support', 'early_access'],
      },
      {
        ...plan('Team', 'p-team', 5999),
        description: 'For teams',
        interval: 'quarter',
      },
    ]);
    const { i18n } = renderWithProviders(<Pricing />);

    expect(await screen.findByText('Studio')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('pricingPage.default_description')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('pricingPage.default_button', { plan: 'Studio' }),
      }),
    ).toBeInTheDocument();
    // A feature the app has a text for, and one it does not have yet.
    expect(
      screen.getByText(i18n!.t('pricingPage.features.priority_support')),
    ).toBeInTheDocument();
    expect(screen.getByText('early access')).toBeInTheDocument();
    expect(screen.getByText('For teams')).toBeInTheDocument();
    expect(screen.getByText('/quarter')).toBeInTheDocument();
  });

  it('describes a known plan and its features in the app language, not in the stored one', async () => {
    // The live plans store their description in Spanish.
    vi.mocked(paymentsApi.getPlans).mockResolvedValue([
      {
        ...plan('Premium', 'p-premium', 999),
        description:
          'Insignia de verificación, Analíticas básicas y Soporte prioritario.',
        features: ['verified_badge', 'basic_analytics'],
      },
    ]);
    const english = renderWithProviders(<Pricing />);

    expect(
      await screen.findByText(english.i18n!.t('pricingPage.desc_premium')),
    ).toBeInTheDocument();
    expect(screen.getByText('Verification badge')).toBeInTheDocument();
    expect(
      screen.queryByText(/Insignia de verificación/),
    ).not.toBeInTheDocument();
    english.unmount();

    renderWithProviders(<Pricing />, { lng: 'es' });
    expect(
      await screen.findByText('Insignia de verificación'),
    ).toBeInTheDocument();
    expect(screen.getByText('Analíticas básicas')).toBeInTheDocument();
  });

  it('says so when there are no plans', async () => {
    vi.mocked(paymentsApi.getPlans).mockResolvedValue([]);
    const { i18n } = renderWithProviders(<Pricing />);

    await waitFor(() =>
      expect(screen.getAllByText(i18n!.t('pricingPage.subtitle')).length).toBe(
        2,
      ),
    );
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('stays on the page when the checkout answers with no address', async () => {
    vi.mocked(paymentsApi.createSubscriptionCheckout).mockResolvedValue({});
    const { i18n } = renderWithProviders(<Pricing />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('pricingPage.button_business'),
      }),
    );

    await waitFor(() =>
      expect(paymentsApi.createSubscriptionCheckout).toHaveBeenCalled(),
    );
    expect(location.href).toBe('/');
  });

  describe('identity verification', () => {
    const unverified = () =>
      useAuthStore.setState({
        isAuthenticated: true,
        profile: { id: 'p1', verificationLevel: 'NONE' } as never,
      });

    it('checks a pending verification on arrival and says when it went through', async () => {
      unverified();
      vi.mocked(usersApi.syncIdentitySession).mockResolvedValue({
        status: 'verified',
      });
      const { i18n } = renderWithProviders(<Pricing />);

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          i18n!.t('pricingPage.identity_verified'),
        ),
      );
    });

    it('does not check again for a verified account, and tolerates a failed check', async () => {
      const first = renderWithProviders(<Pricing />);
      await screen.findByText('Premium');
      expect(usersApi.syncIdentitySession).not.toHaveBeenCalled();
      first.unmount();

      unverified();
      vi.mocked(usersApi.syncIdentitySession).mockRejectedValue(
        new Error('down'),
      );
      renderWithProviders(<Pricing />);

      expect(await screen.findByText('Premium')).toBeInTheDocument();
      expect(usersApi.syncIdentitySession).toHaveBeenCalledTimes(1);
      expect(toast.success).not.toHaveBeenCalled();
    });

    // The server refuses the checkout with this text until the identity is
    // verified (IdentityVerifiedGuard).
    const refuseForIdentity = () =>
      vi
        .mocked(paymentsApi.createSubscriptionCheckout)
        .mockRejectedValue(
          Object.assign(
            new Error(
              'Debes verificar tu identidad primero para poder comprar o cobrar.',
            ),
            { status: 403, data: {} },
          ),
        );

    async function openVerificationNotice(i18n: {
      t: (key: string) => string;
    }) {
      fireEvent.click(
        await screen.findByRole('button', {
          name: i18n.t('pricingPage.button_premium'),
        }),
      );
      await waitFor(() => expect(toast).toHaveBeenCalled());
      const renderNotice = vi.mocked(toast).mock
        .calls[0][0] as unknown as (item: { id: string }) => ReactElement;
      render(renderNotice({ id: 'toast-1' }));
      return screen.getByRole('button', {
        name: i18n.t('pricingPage.verify_button'),
      });
    }

    it('offers to verify the identity when the checkout needs it, and opens the verification', async () => {
      refuseForIdentity();
      vi.mocked(usersApi.createIdentitySession).mockResolvedValue({
        url: 'https://verify.stripe.com/start',
      });
      const { i18n } = renderWithProviders(<Pricing />);

      const verify = await openVerificationNotice(i18n!);
      expect(
        screen.getByText(i18n!.t('pricingPage.verification_required_title')),
      ).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
      fireEvent.click(verify);

      await waitFor(() =>
        expect(location.href).toBe('https://verify.stripe.com/start'),
      );
      expect(toast.dismiss).toHaveBeenCalledWith('toast-1');
      expect(usersApi.createIdentitySession).toHaveBeenCalledWith('/');
    });

    it('says so when the verification cannot be started', async () => {
      refuseForIdentity();
      vi.mocked(usersApi.createIdentitySession).mockRejectedValue(
        new Error('down'),
      );
      const { i18n } = renderWithProviders(<Pricing />);

      fireEvent.click(await openVerificationNotice(i18n!));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n!.t('pricingPage.verify_error'),
        ),
      );
      expect(location.href).toBe('/');
    });

    it('stays on the page when the verification answers with no address', async () => {
      refuseForIdentity();
      vi.mocked(usersApi.createIdentitySession).mockResolvedValue({});
      const { i18n } = renderWithProviders(<Pricing />);

      fireEvent.click(await openVerificationNotice(i18n!));

      await waitFor(() =>
        expect(usersApi.createIdentitySession).toHaveBeenCalled(),
      );
      expect(location.href).toBe('/');
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});
