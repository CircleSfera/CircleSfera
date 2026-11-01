import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monetizationApi } from '../../services/monetization.service';
import { renderWithProviders } from '../../test/test-utils';
import { countryName } from '../../utils/countries';
import TaxDetailsSettings from './TaxDetailsSettings';

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: { getTaxDetailsStatus: vi.fn() },
}));
// The provider's panel stands in as a marker that can say it saved.
vi.mock('./TaxDetailsPanels', () => ({
  default: ({ panel, onChange }: { panel: string; onChange?: () => void }) => (
    <button type="button" data-testid={`panel-${panel}`} onClick={onChange}>
      saved
    </button>
  ),
}));
const native = vi.hoisted(() => ({ value: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.value },
}));

const SET = {
  headOffice: { city: 'Madrid', country: 'ES' },
  status: 'active' as const,
  registrationCountries: ['ES', 'FR'],
};

describe('TaxDetailsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    native.value = false;
    vi.mocked(monetizationApi.getTaxDetailsStatus).mockResolvedValue(SET);
  });

  it('shows where the account is based and where it is registered, with why it matters', async () => {
    const { i18n } = renderWithProviders(<TaxDetailsSettings />);
    const t = i18n!.t.bind(i18n);
    const lang = i18n!.language;

    expect(screen.getByText(t('settings.monetization.tax.desc'))).toBeVisible();
    expect(
      await screen.findByText(`Madrid, ${countryName('ES', lang)}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${countryName('ES', lang)}, ${countryName('FR', lang)}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(t('settings.monetization.tax.edit'))).toBeVisible();
    expect(
      screen.getByText(t('settings.monetization.tax.manage')),
    ).toBeVisible();
  });

  it('an account with nothing set says so, and that Stripe charges no VAT', async () => {
    vi.mocked(monetizationApi.getTaxDetailsStatus).mockResolvedValue({
      headOffice: null,
      status: 'pending',
      registrationCountries: [],
    });
    const { i18n } = renderWithProviders(<TaxDetailsSettings />);
    const t = i18n!.t.bind(i18n);

    expect(
      await screen.findByText(t('settings.monetization.tax.address_none')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t('settings.monetization.tax.registrations_none')),
    ).toBeInTheDocument();
    expect(screen.getByText(t('settings.monetization.tax.add'))).toBeVisible();
  });

  it('a head office with only a country shows the country', async () => {
    vi.mocked(monetizationApi.getTaxDetailsStatus).mockResolvedValue({
      ...SET,
      headOffice: { city: null, country: 'ES' },
    });
    const { i18n } = renderWithProviders(<TaxDetailsSettings />);

    expect(
      await screen.findByText(countryName('ES', i18n!.language)),
    ).toBeInTheDocument();
  });

  it('says so while it reads, and when it cannot', async () => {
    let fail: (error: Error) => void = () => {};
    vi.mocked(monetizationApi.getTaxDetailsStatus).mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const { i18n } = renderWithProviders(<TaxDetailsSettings />);
    const t = i18n!.t.bind(i18n);

    expect(
      screen.getAllByText(t('settings.monetization.tax.reading')),
    ).toHaveLength(2);
    fail(new Error('down'));
    await waitFor(() =>
      expect(
        screen.getAllByText(t('settings.monetization.tax.unreadable')),
      ).toHaveLength(2),
    );
  });

  it('opens each panel in a dialog, and reads the rows again when it saves or closes', async () => {
    const { i18n } = renderWithProviders(<TaxDetailsSettings />);
    const t = i18n!.t.bind(i18n);
    await screen.findByText(t('settings.monetization.tax.edit'));

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(t('settings.monetization.tax.address')),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(t('settings.monetization.tax.address')),
    ).toBeInTheDocument();
    fireEvent.click(await within(dialog).findByTestId('panel-settings'));
    await waitFor(() =>
      expect(monetizationApi.getTaxDetailsStatus).toHaveBeenCalledTimes(2),
    );

    fireEvent.click(
      within(dialog).getByRole('button', { name: t('common.close_dialog') }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(monetizationApi.getTaxDetailsStatus).toHaveBeenCalledTimes(3),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(t('settings.monetization.tax.registrations')),
      }),
    );
    expect(
      await screen.findByTestId('panel-registrations'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText(
        t('settings.monetization.tax.registrations'),
      ),
    ).toBeInTheDocument();
  });

  it('the phone apps show the rows and send the editing to the web', async () => {
    native.value = true;
    const { i18n } = renderWithProviders(<TaxDetailsSettings />);
    const t = i18n!.t.bind(i18n);

    expect(
      await screen.findByText(t('settings.monetization.tax.on_web')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByText(t('settings.monetization.tax.manage')),
    ).not.toBeInTheDocument();
  });
});
