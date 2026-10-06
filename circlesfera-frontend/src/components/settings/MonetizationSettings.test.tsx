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
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
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

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://connect.stripe.com/express/x',
        '_blank',
        'noopener,noreferrer',
      ),
    );
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
