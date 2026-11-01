import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { monetizationApi } from '../../services/monetization.service';
import { renderWithProviders } from '../../test/test-utils';
import { formatCents } from '../../utils/money';
import { MonetizationSettings } from './MonetizationSettings';

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: {
    getStatus: vi.fn(),
    getMonetization: vi.fn(),
    connectAccount: vi.fn(),
    getDashboardLink: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

const originalLocation = window.location;
const location = { href: 'https://circlesfera.com/settings/monetization' };

describe('MonetizationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    location.href = 'https://circlesfera.com/settings/monetization';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
    vi.mocked(monetizationApi.getMonetization).mockResolvedValue({
      lifetimeEarningsCents: 123456,
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('an unconnected account connects Stripe and comes back here', async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: false,
    });
    vi.mocked(monetizationApi.connectAccount).mockResolvedValue({
      url: 'https://connect.stripe.com/setup/x',
    });
    const { i18n } = renderWithProviders(<MonetizationSettings />);

    expect(
      await screen.findByText(
        i18n!.t('settings.monetization.status.unconnected'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('settings.monetization.earnings')),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.monetization.connect'),
      }),
    );

    await waitFor(() =>
      expect(location.href).toBe('https://connect.stripe.com/setup/x'),
    );
    expect(monetizationApi.connectAccount).toHaveBeenCalledWith(
      'https://circlesfera.com/settings/monetization',
      'https://circlesfera.com/settings/monetization',
    );
  });

  it('an account paid out to but unable to sell is updated in Stripe, not opened in its panel', async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: true,
      ownAccount: true,
      transfersEnabled: true,
      chargesEnabled: false,
      detailsSubmitted: true,
    });
    vi.mocked(monetizationApi.connectAccount).mockResolvedValue({
      url: 'https://connect.stripe.com/setup/direct',
    });
    const { i18n } = renderWithProviders(<MonetizationSettings />);

    expect(
      await screen.findByText(i18n!.t('settings.monetization.status.update')),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('settings.monetization.dashboard'),
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.monetization.update'),
      }),
    );

    await waitFor(() =>
      expect(location.href).toBe('https://connect.stripe.com/setup/direct'),
    );
  });

  it('reports a failed connection', async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: false,
    });
    vi.mocked(monetizationApi.connectAccount).mockRejectedValue(
      new Error('down'),
    );
    const { i18n } = renderWithProviders(<MonetizationSettings />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.monetization.connect'),
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('settings.monetization.error_connect'),
      ),
    );
  });

  it("a Profile paid into another Profile's account is told so, and connects its own", async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: true,
      ownAccount: false,
      transfersEnabled: true,
      detailsSubmitted: true,
    });
    vi.mocked(monetizationApi.connectAccount).mockResolvedValue({
      url: 'https://connect.stripe.com/setup/own',
    });
    const { i18n } = renderWithProviders(<MonetizationSettings />);

    expect(
      await screen.findByText(i18n!.t('settings.monetization.status.shared')),
    ).toBeInTheDocument();
    // Told before going to Stripe that it may reuse the verified details.
    expect(
      screen.getByText(i18n!.t('settings.monetization.own_account_note')),
    ).toBeInTheDocument();
    // The other Profile's Stripe panel is not offered here.
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('settings.monetization.dashboard'),
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.monetization.connect_own'),
      }),
    );

    await waitFor(() =>
      expect(location.href).toBe('https://connect.stripe.com/setup/own'),
    );
  });

  it('an account whose onboarding is not done goes back to it, not to the panel', async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: true,
      ownAccount: true,
      transfersEnabled: false,
      detailsSubmitted: false,
    });
    vi.mocked(monetizationApi.connectAccount).mockResolvedValue({
      url: 'https://connect.stripe.com/setup/again',
    });
    const { i18n } = renderWithProviders(<MonetizationSettings />);

    expect(
      await screen.findByText(
        i18n!.t('settings.monetization.status.incomplete'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('settings.monetization.dashboard'),
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.monetization.complete'),
      }),
    );

    await waitFor(() =>
      expect(location.href).toBe('https://connect.stripe.com/setup/again'),
    );
  });

  it('a connected account without payouts is told onboarding is incomplete', async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: true,
      transfersEnabled: false,
    });
    const { i18n } = renderWithProviders(<MonetizationSettings />);

    expect(
      await screen.findByText(
        i18n!.t('settings.monetization.status.incomplete'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('settings.monetization.earnings')),
    ).not.toBeInTheDocument();
  });

  it('an active creator sees earnings in euros and opens the Stripe dashboard safely', async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: true,
      transfersEnabled: true,
    });
    vi.mocked(monetizationApi.getDashboardLink).mockResolvedValue({
      url: 'https://connect.stripe.com/express/x',
    });
    const tab = {
      closed: false,
      opener: window,
      close: vi.fn(),
      location: { replace: vi.fn() },
    };
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue(tab as unknown as Window);
    const { i18n } = renderWithProviders(<MonetizationSettings />);

    expect(
      await screen.findByText(formatCents(123456, i18n!.language)),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.monetization.dashboard'),
      }),
    );

    // Opened at the tap, then sent to the link, with no handle on this page.
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() =>
      expect(tab.location.replace).toHaveBeenCalledWith(
        'https://connect.stripe.com/express/x',
      ),
    );
    expect(tab.opener).toBeNull();
    open.mockRestore();
  });

  it('reports a dashboard link failure', async () => {
    vi.mocked(monetizationApi.getStatus).mockResolvedValue({
      connected: true,
      transfersEnabled: true,
    });
    vi.mocked(monetizationApi.getDashboardLink).mockRejectedValue(
      new Error('down'),
    );
    const { i18n } = renderWithProviders(<MonetizationSettings />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.monetization.dashboard'),
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('settings.monetization.error_dashboard'),
      ),
    );
  });
});
