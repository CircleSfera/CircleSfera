import {
  AD_CONSENT_TEXT_VERSION,
  ADS_CONSENT_FLAG,
  type AdConsentStatus,
} from '@circlesfera/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADS_CONSENT_QUERY_KEY,
  adsConsentApi,
} from '../../services/adsConsent.service';
import { useAuthStore } from '../../stores/authStore';
import { useExperimentStore } from '../../stores/useExperimentStore';
import { renderWithProviders } from '../../test/test-utils';
import AdsConsentGate from './AdsConsentGate';

vi.mock('../../services/adsConsent.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../services/adsConsent.service')
  >()),
  adsConsentApi: { status: vi.fn(), answer: vi.fn() },
}));

const unanswered: AdConsentStatus = {
  choice: null,
  decidedAt: null,
  textVersion: null,
  currentTextVersion: AD_CONSENT_TEXT_VERSION,
  personalisationAllowed: true,
  dateOfBirthMissing: false,
  effectiveChoice: 'GENERAL',
  askNow: true,
};

// The error the API client hands a screen for a refused answer.
const refused = (status: number, errorCode: string) =>
  Object.assign(new Error(errorCode), { status, data: { errorCode } });
const answered = (choice: 'PERSONALISED' | 'GENERAL'): AdConsentStatus => ({
  ...unanswered,
  choice,
  decidedAt: '2026-12-01T10:00:00.000Z',
  textVersion: AD_CONSENT_TEXT_VERSION,
  effectiveChoice: choice,
  askNow: false,
});

function flag(on: boolean) {
  useExperimentStore.setState({
    flags: on ? { [ADS_CONSENT_FLAG]: true } : {},
    isLoaded: true,
  });
}

describe('AdsConsentGate (PD-084)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: true });
    flag(true);
    vi.mocked(adsConsentApi.status).mockResolvedValue(unanswered);
  });

  it('shows nothing and asks the server nothing while the flag is off', async () => {
    flag(false);
    renderWithProviders(<AdsConsentGate />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('ads-consent-screen')).not.toBeInTheDocument();
    expect(adsConsentApi.status).not.toHaveBeenCalled();
  });

  it('shows nothing to someone signed out', async () => {
    useAuthStore.setState({ isAuthenticated: false });
    renderWithProviders(<AdsConsentGate />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('ads-consent-screen')).not.toBeInTheDocument();
    expect(adsConsentApi.status).not.toHaveBeenCalled();
  });

  it('shows nothing when the server says not to ask (under 18, already answered, 6 months after a no)', async () => {
    vi.mocked(adsConsentApi.status).mockResolvedValue({
      ...unanswered,
      askNow: false,
      personalisationAllowed: false,
    });
    renderWithProviders(<AdsConsentGate />);

    await waitFor(() => expect(adsConsentApi.status).toHaveBeenCalled());
    expect(screen.queryByTestId('ads-consent-screen')).not.toBeInTheDocument();
  });

  it.each([
    ['en', 'How should your ads be chosen?'],
    ['es', '¿Cómo quieres que se elijan tus anuncios?'],
  ] as const)(
    'asks in %s with the texts the owner decided, nothing chosen and both answers alike',
    async (lng, title) => {
      const { i18n } = renderWithProviders(<AdsConsentGate />, { lng });

      const dialog = await screen.findByRole('dialog', { name: title });
      expect(dialog).toHaveAccessibleDescription(i18n!.t('adsConsent.text'));
      const personalised = screen.getByTestId('ads-consent-personalised');
      const general = screen.getByTestId('ads-consent-general');
      expect(personalised).toHaveTextContent(
        i18n!.t('adsConsent.personalised.label'),
      );
      expect(general).toHaveTextContent(i18n!.t('adsConsent.general.label'));
      // No default: neither is pressed, and the reader starts at the title.
      expect(personalised).not.toHaveAttribute('aria-pressed');
      expect(general).not.toHaveAttribute('aria-pressed');
      expect(screen.getByRole('heading', { name: title })).toHaveFocus();
      // The same size, colour and weight: drawn by the same classes.
      expect(personalised.className).toBe(general.className);
      expect(personalised.tagName).toBe(general.tagName);
    },
  );

  it('the Spanish texts are the decided ones, word for word', () => {
    const { i18n } = renderWithProviders(<div />, { lng: 'es' });
    expect(i18n!.t('adsConsent.text')).toBe(
      'CircleSfera es gratis y se paga con anuncios. Tú eliges cómo se seleccionan. Puedes cambiarlo cuando quieras en Ajustes.',
    );
    expect(i18n!.t('adsConsent.personalised.label')).toBe(
      'Personalizar con mi actividad en otras webs y apps',
    );
    expect(i18n!.t('adsConsent.general.label')).toBe('Solo anuncios generales');
  });

  it('the English texts are the decided ones, word for word', () => {
    const { i18n } = renderWithProviders(<div />, { lng: 'en' });
    expect(i18n!.t('adsConsent.text')).toBe(
      'CircleSfera is free and is paid for by ads. You choose how they are picked. You can change this at any time in Settings.',
    );
    expect(i18n!.t('adsConsent.personalised.hint')).toBe(
      'Advertisers can show you ads based on what you did on their websites and apps, and include you in their audiences.',
    );
    expect(i18n!.t('adsConsent.general.hint')).toBe(
      'Ads chosen by what you are watching, your city, your language and the interests you pick.',
    );
  });

  it.each([
    ['general', 'GENERAL'],
    ['personalised', 'PERSONALISED'],
  ] as const)(
    'one tap on %s saves it from the screen, in the language shown, and closes it',
    async (key, choice) => {
      const user = userEvent.setup();
      vi.mocked(adsConsentApi.answer).mockResolvedValue(answered(choice));
      renderWithProviders(<AdsConsentGate />, { lng: 'es' });

      await user.click(await screen.findByTestId(`ads-consent-${key}`));

      expect(adsConsentApi.answer).toHaveBeenCalledWith(choice, 'PROMPT', 'es');
      await waitFor(() =>
        expect(
          screen.queryByTestId('ads-consent-screen'),
        ).not.toBeInTheDocument(),
      );
    },
  );

  it('a status read still on its way when the answer is saved does not bring the screen back', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<AdsConsentGate />);
    await screen.findByTestId('ads-consent-screen');

    // A read asked before the answer, which lands after it.
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
      expect(
        screen.queryByTestId('ads-consent-screen'),
      ).not.toBeInTheDocument(),
    );
    land(unanswered);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByTestId('ads-consent-screen')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(ADS_CONSENT_QUERY_KEY)).toMatchObject({
      askNow: false,
      choice: 'GENERAL',
    });
  });

  it('stays open when the answer could not be saved', async () => {
    const user = userEvent.setup();
    vi.mocked(adsConsentApi.answer).mockRejectedValue(new Error('offline'));
    renderWithProviders(<AdsConsentGate />);

    await user.click(await screen.findByTestId('ads-consent-general'));

    await waitFor(() => expect(adsConsentApi.answer).toHaveBeenCalled());
    expect(screen.getByTestId('ads-consent-screen')).toBeInTheDocument();
  });

  it.each([
    [409, 'AD_CONSENT_TEXT_OUTDATED'],
    [403, 'FEATURE_DISABLED'],
  ])(
    'gets out of the way when the server will not take the answer (%s %s), instead of blocking the app',
    async (status, code) => {
      const user = userEvent.setup();
      vi.mocked(adsConsentApi.answer).mockRejectedValue(refused(status, code));
      renderWithProviders(<AdsConsentGate />);

      await user.click(await screen.findByTestId('ads-consent-personalised'));

      await waitFor(() =>
        expect(
          screen.queryByTestId('ads-consent-screen'),
        ).not.toBeInTheDocument(),
      );
    },
  );

  it('keeps Tab and Shift+Tab inside the screen', async () => {
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(
      <>
        <button type="button">outside before</button>
        <AdsConsentGate />
        <button type="button">outside after</button>
      </>,
    );
    const dialog = await screen.findByTestId('ads-consent-screen');
    const heading = screen.getByRole('heading', {
      name: i18n!.t('adsConsent.title'),
    });
    expect(heading).toHaveFocus();

    // Backwards from the title: round to the last control, the policy.
    await user.tab({ shift: true });
    const policy = screen.getByRole('link', {
      name: i18n!.t('adsConsent.privacy_policy'),
    });
    expect(policy).toHaveFocus();

    // Forwards from the last control: round to the first answer.
    await user.tab();
    expect(screen.getByTestId('ads-consent-personalised')).toHaveFocus();

    // Every stop on the way round is inside the screen.
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('links the privacy policy, and leaves the policy uncovered', async () => {
    const { i18n } = renderWithProviders(<AdsConsentGate />);
    expect(
      await screen.findByRole('link', {
        name: i18n!.t('adsConsent.privacy_policy'),
      }),
    ).toHaveAttribute('href', '/privacy');
  });

  it.each(['/privacy', '/terms'])(
    'is not drawn over %s, which stays readable',
    async (path) => {
      renderWithProviders(<AdsConsentGate />, {
        routerProps: { initialEntries: [path] },
      });

      await waitFor(() => expect(adsConsentApi.status).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        screen.queryByTestId('ads-consent-screen'),
      ).not.toBeInTheDocument();
    },
  );

  it('"What this means" opens the explanation and the data used', async () => {
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(<AdsConsentGate />);

    const link = await screen.findByRole('button', {
      name: i18n!.t('adsConsent.what_this_means'),
    });
    expect(link).toHaveAttribute('aria-expanded', 'false');
    await user.click(link);

    expect(link).toHaveAttribute('aria-expanded', 'true');
    const explanation = screen.getByRole('region', {
      name: i18n!.t('adsConsent.explain.title'),
    });
    for (const key of [
      'adsConsent.explain.general_items.topic',
      'adsConsent.explain.general_items.city',
      'adsConsent.explain.general_items.language',
      'adsConsent.explain.general_items.time',
      'adsConsent.explain.general_items.interests',
      'adsConsent.explain.personalised_items.activity',
      'adsConsent.explain.personalised_items.audiences',
      'adsConsent.explain.never_items.sensitive',
      'adsConsent.explain.never_items.minors',
    ]) {
      expect(explanation).toHaveTextContent(i18n!.t(key));
    }
    // Reading it chooses nothing.
    expect(adsConsentApi.answer).not.toHaveBeenCalled();
  });
});
