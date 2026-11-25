import {
  AD_CONSENT_TEXT_VERSION,
  type AdConsentStatus,
} from '@circlesfera/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adsConsentApi } from '../../services/adsConsent.service';
import { renderWithProviders } from '../../test/test-utils';
import AdsSettings from './AdsSettings';

vi.mock('../../services/adsConsent.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../services/adsConsent.service')
  >()),
  adsConsentApi: { status: vi.fn(), answer: vi.fn() },
}));

const status = (over: Partial<AdConsentStatus> = {}): AdConsentStatus => ({
  choice: null,
  decidedAt: null,
  textVersion: null,
  currentTextVersion: AD_CONSENT_TEXT_VERSION,
  personalisationAllowed: true,
  effectiveChoice: 'GENERAL',
  askNow: false,
  ...over,
});
const answered = (choice: 'PERSONALISED' | 'GENERAL') =>
  status({
    choice,
    decidedAt: '2026-12-01T10:00:00.000Z',
    textVersion: AD_CONSENT_TEXT_VERSION,
    effectiveChoice: choice,
  });

describe('AdsSettings (Settings → Ads, PD-084)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the answer in force and withdraws it with one tap on the other', async () => {
    const user = userEvent.setup();
    vi.mocked(adsConsentApi.status).mockResolvedValue(answered('PERSONALISED'));
    vi.mocked(adsConsentApi.answer).mockResolvedValue(answered('GENERAL'));
    const { i18n } = renderWithProviders(<AdsSettings />);

    const personalised = await screen.findByTestId('ads-consent-personalised');
    const general = screen.getByTestId('ads-consent-general');
    expect(personalised).toHaveAttribute('aria-pressed', 'true');
    expect(general).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('ads-consent-current')).toHaveTextContent(
      i18n!.t('adsConsent.settings.current', {
        choice: i18n!.t('adsConsent.personalised.label'),
      }),
    );

    await user.click(general);

    expect(adsConsentApi.answer).toHaveBeenCalledWith(
      'GENERAL',
      'SETTINGS',
      'en',
    );
    await waitFor(() =>
      expect(screen.getByTestId('ads-consent-general')).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(screen.getByTestId('ads-consent-personalised')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('gives consent from Settings the same way', async () => {
    const user = userEvent.setup();
    vi.mocked(adsConsentApi.status).mockResolvedValue(answered('GENERAL'));
    vi.mocked(adsConsentApi.answer).mockResolvedValue(answered('PERSONALISED'));
    renderWithProviders(<AdsSettings />, { lng: 'es' });

    await user.click(await screen.findByTestId('ads-consent-personalised'));

    expect(adsConsentApi.answer).toHaveBeenCalledWith(
      'PERSONALISED',
      'SETTINGS',
      'es',
    );
  });

  it('tapping the answer already in force sends nothing', async () => {
    const user = userEvent.setup();
    vi.mocked(adsConsentApi.status).mockResolvedValue(answered('GENERAL'));
    renderWithProviders(<AdsSettings />);

    await user.click(await screen.findByTestId('ads-consent-general'));

    expect(adsConsentApi.answer).not.toHaveBeenCalled();
  });

  it('with no answer yet, nothing is chosen and general ads apply', async () => {
    vi.mocked(adsConsentApi.status).mockResolvedValue(status());
    const { i18n } = renderWithProviders(<AdsSettings />);

    expect(
      await screen.findByText(i18n!.t('adsConsent.settings.none')),
    ).toBeInTheDocument();
    expect(screen.getByTestId('ads-consent-personalised')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('ads-consent-general')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('under 18: general ads only, and the other answer is not offered', async () => {
    vi.mocked(adsConsentApi.status).mockResolvedValue(
      status({ personalisationAllowed: false }),
    );
    const { i18n } = renderWithProviders(<AdsSettings />);

    expect(await screen.findByTestId('ads-consent-minor')).toHaveTextContent(
      i18n!.t('adsConsent.settings.minor'),
    );
    expect(
      screen.queryByTestId('ads-consent-personalised'),
    ).not.toBeInTheDocument();
  });
});
