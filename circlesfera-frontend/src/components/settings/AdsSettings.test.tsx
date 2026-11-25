import {
  AD_CONSENT_TEXT_VERSION,
  ADS_CONSENT_FLAG,
  type AdConsentStatus,
} from '@circlesfera/shared';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adInterestsApi } from '../../services/adInterests.service';
import {
  ADS_CONSENT_QUERY_KEY,
  adsConsentApi,
} from '../../services/adsConsent.service';
import { useExperimentStore } from '../../stores/useExperimentStore';
import { renderWithProviders } from '../../test/test-utils';
import AdsSettings from './AdsSettings';

vi.mock('../../services/adsConsent.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../services/adsConsent.service')
  >()),
  adsConsentApi: { status: vi.fn(), answer: vi.fn() },
}));

vi.mock('../../services/adInterests.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../services/adInterests.service')
  >()),
  adInterestsApi: { status: vi.fn(), choose: vi.fn() },
}));

const status = (over: Partial<AdConsentStatus> = {}): AdConsentStatus => ({
  choice: null,
  decidedAt: null,
  textVersion: null,
  currentTextVersion: AD_CONSENT_TEXT_VERSION,
  personalisationAllowed: true,
  dateOfBirthMissing: false,
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

  it('a status read still on its way when the answer is saved does not show the old answer', async () => {
    const user = userEvent.setup();
    vi.mocked(adsConsentApi.status).mockResolvedValue(answered('PERSONALISED'));
    const { queryClient } = renderWithProviders(<AdsSettings />);
    await screen.findByTestId('ads-consent-personalised');

    let land: (value: AdConsentStatus) => void = () => {};
    vi.mocked(adsConsentApi.status).mockReturnValue(
      new Promise((resolve) => {
        land = resolve;
      }),
    );
    void queryClient
      .refetchQueries({ queryKey: ADS_CONSENT_QUERY_KEY })
      .catch(() => undefined);
    vi.mocked(adsConsentApi.answer).mockResolvedValue(answered('GENERAL'));

    await user.click(screen.getByTestId('ads-consent-general'));
    await waitFor(() =>
      expect(screen.getByTestId('ads-consent-general')).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    land(answered('PERSONALISED'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByTestId('ads-consent-general')).toHaveAttribute(
      'aria-pressed',
      'true',
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
    expect(
      screen.queryByTestId('ads-consent-no-birth-date'),
    ).not.toBeInTheDocument();
  });

  it('no date of birth: says that is why ads are general, and where to add it', async () => {
    vi.mocked(adsConsentApi.status).mockResolvedValue(
      status({ personalisationAllowed: false, dateOfBirthMissing: true }),
    );
    const { i18n } = renderWithProviders(<AdsSettings />, { lng: 'es' });

    const note = await screen.findByTestId('ads-consent-no-birth-date');
    expect(note).toHaveTextContent(
      i18n!.t('adsConsent.settings.no_birth_date'),
    );
    expect(
      screen.getByRole('link', {
        name: i18n!.t('adsConsent.settings.add_birth_date'),
      }),
    ).toHaveAttribute('href', '/accounts/account');
    // Not told they are under 18, which is not known.
    expect(screen.queryByTestId('ads-consent-minor')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('ads-consent-personalised'),
    ).not.toBeInTheDocument();
  });

  describe('your interests', () => {
    afterEach(() => {
      act(() => useExperimentStore.getState().setFlags({}));
    });

    it('come after how ads are chosen, with the ads flag on', async () => {
      act(() =>
        useExperimentStore.getState().setFlags({ [ADS_CONSENT_FLAG]: true }),
      );
      vi.mocked(adsConsentApi.status).mockResolvedValue(status());
      vi.mocked(adInterestsApi.status).mockResolvedValue({
        interests: ['travel'],
        maxInterests: 10,
        allowed: true,
        dateOfBirthMissing: false,
        updatedAt: null,
      });
      renderWithProviders(<AdsSettings />, { lng: 'es' });

      const interests = await screen.findByTestId('ad-interests');
      const consent = await screen.findByTestId('ads-consent-general');
      expect(interests).toHaveTextContent('Tus intereses');
      expect(
        consent.compareDocumentPosition(interests) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('are not there while the ads flag is off', async () => {
      act(() =>
        useExperimentStore.getState().setFlags({ [ADS_CONSENT_FLAG]: false }),
      );
      vi.mocked(adsConsentApi.status).mockResolvedValue(status());
      renderWithProviders(<AdsSettings />);

      await screen.findByTestId('ads-consent-general');
      expect(screen.queryByTestId('ad-interests')).not.toBeInTheDocument();
      expect(adInterestsApi.status).not.toHaveBeenCalled();
    });
  });
});
