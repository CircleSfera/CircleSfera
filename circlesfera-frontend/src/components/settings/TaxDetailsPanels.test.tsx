import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monetizationApi } from '../../services/monetization.service';
import { renderWithProviders } from '../../test/test-utils';
import TaxDetailsPanels, {
  panelsAppearance,
  panelsLocale,
} from './TaxDetailsPanels';

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: { createTaxDetailsSession: vi.fn() },
}));

// The provider's script is never loaded here: the instance and the panels
// are replaced, and the panels say when they draw or fail.
const provider = vi.hoisted(() => ({
  init: vi.fn(),
  update: vi.fn(),
  events: {} as Record<string, { start?: () => void; error?: () => void }>,
}));
vi.mock('@stripe/connect-js/pure', () => ({
  loadConnectAndInitialize: (params: unknown) => {
    provider.init(params);
    return { update: provider.update };
  },
}));
vi.mock('@stripe/react-connect-js', () => {
  const panel =
    (name: string) =>
    (props: { onLoaderStart?: () => void; onLoadError?: () => void }) => {
      provider.events[name] = {
        start: props.onLoaderStart,
        error: props.onLoadError,
      };
      return <div data-testid={name} />;
    };
  return {
    ConnectComponentsProvider: ({ children }: { children: unknown }) =>
      children,
    ConnectTaxSettings: panel('tax-settings'),
    ConnectTaxRegistrations: panel('tax-registrations'),
  };
});

type InitParams = {
  publishableKey: string;
  fetchClientSecret: () => Promise<string>;
  locale: string;
  appearance: ReturnType<typeof panelsAppearance>;
};
const initParams = () => provider.init.mock.calls.at(-1)?.[0] as InitParams;

describe('TaxDetailsPanels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    provider.events = {};
    vi.mocked(monetizationApi.createTaxDetailsSession).mockResolvedValue({
      clientSecret: 'accs_secret__first',
      publishableKey: 'pk_test_1',
    });
  });

  it('loads the tax settings and registrations with the key and the session the server gives', async () => {
    const { i18n } = renderWithProviders(<TaxDetailsPanels />);

    expect(
      screen.getByRole('status', {
        name: i18n!.t('settings.monetization.tax.loading'),
      }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('tax-settings')).toBeInTheDocument();
    expect(screen.getByTestId('tax-registrations')).toBeInTheDocument();
    expect(initParams().publishableKey).toBe('pk_test_1');

    // The panels drawn, the app's own loader goes.
    act(() => provider.events['tax-settings'].start?.());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('hands the provider the first session, then a new one each time it asks again', async () => {
    renderWithProviders(<TaxDetailsPanels />);
    await screen.findByTestId('tax-settings');
    vi.mocked(monetizationApi.createTaxDetailsSession).mockResolvedValue({
      clientSecret: 'accs_secret__second',
      publishableKey: 'pk_test_1',
    });

    await expect(initParams().fetchClientSecret()).resolves.toBe(
      'accs_secret__first',
    );
    await expect(initParams().fetchClientSecret()).resolves.toBe(
      'accs_secret__second',
    );
    expect(monetizationApi.createTaxDetailsSession).toHaveBeenCalledTimes(2);
  });

  it('speaks the language of the app, and follows it when it changes', async () => {
    const { i18n } = renderWithProviders(<TaxDetailsPanels />);
    await screen.findByTestId('tax-settings');
    expect(initParams().locale).toBe(panelsLocale(i18n!.language));

    await act(async () => {
      await i18n!.changeLanguage('es');
    });
    expect(provider.update).toHaveBeenLastCalledWith({ locale: 'es-ES' });
    await act(async () => {
      await i18n!.changeLanguage('en');
    });
  });

  it('says so when the session cannot be opened, and tries again', async () => {
    vi.mocked(monetizationApi.createTaxDetailsSession).mockRejectedValueOnce(
      new Error('down'),
    );
    const { i18n } = renderWithProviders(<TaxDetailsPanels />);

    expect(
      await screen.findByText(i18n!.t('settings.monetization.tax.error')),
    ).toBeInTheDocument();
    expect(provider.init).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.monetization.tax.retry'),
      }),
    );
    expect(await screen.findByTestId('tax-settings')).toBeInTheDocument();
  });

  it('says so when the panels fail before drawing anything', async () => {
    const { i18n } = renderWithProviders(<TaxDetailsPanels />);
    await screen.findByTestId('tax-settings');

    act(() => provider.events['tax-settings'].error?.());

    expect(
      await screen.findByText(i18n!.t('settings.monetization.tax.error')),
    ).toBeInTheDocument();
  });

  it('leaves a failure after drawing to the panels, which show it themselves', async () => {
    const { i18n } = renderWithProviders(<TaxDetailsPanels />);
    await screen.findByTestId('tax-settings');
    act(() => provider.events['tax-settings'].start?.());

    act(() => provider.events['tax-settings'].error?.());

    expect(
      screen.queryByText(i18n!.t('settings.monetization.tax.error')),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('tax-settings')).toBeInTheDocument();
  });

  it('opens nothing once it is gone before the session arrives', async () => {
    let answer: (value: {
      clientSecret: string;
      publishableKey: string;
    }) => void = () => {};
    vi.mocked(monetizationApi.createTaxDetailsSession).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { unmount } = renderWithProviders(<TaxDetailsPanels />);
    unmount();

    await act(async () => {
      answer({ clientSecret: 'accs_secret__late', publishableKey: 'pk_x' });
    });
    expect(provider.init).not.toHaveBeenCalled();
  });

  it('reports nothing once it is gone before the session fails', async () => {
    let fail: (error: Error) => void = () => {};
    vi.mocked(monetizationApi.createTaxDetailsSession).mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const { unmount } = renderWithProviders(<TaxDetailsPanels />);
    unmount();

    await act(async () => {
      fail(new Error('down'));
    });
    expect(provider.init).not.toHaveBeenCalled();
  });
});

describe('the look and the language of the panels', () => {
  it('maps the app language to one the provider speaks', () => {
    expect(panelsLocale('es')).toBe('es-ES');
    expect(panelsLocale('es-ES')).toBe('es-ES');
    expect(panelsLocale('en')).toBe('en-GB');
    expect(panelsLocale(undefined)).toBe('en-GB');
  });

  it("draws them with the app's theme colours, read from the page", () => {
    document.documentElement.style.setProperty('--brand-primary', '#123456');
    try {
      const { overlays, variables } = panelsAppearance();
      expect(overlays).toBe('dialog');
      expect(variables.colorPrimary).toBe('#123456');
      expect(variables.buttonPrimaryColorBackground).toBe('#123456');
      // A colour the page does not define keeps the theme's own value.
      expect(variables.colorBackground).toBe('#0a0a0a');
    } finally {
      document.documentElement.style.removeProperty('--brand-primary');
    }
  });
});
