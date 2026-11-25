import { ADS_CONSENT_FLAG } from '@circlesfera/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileApi } from '../../services';
import { paymentsApi } from '../../services/payments.service';
import { useExperimentStore } from '../../stores/useExperimentStore';
import { renderWithProviders } from '../../test/test-utils';
import SettingsHubIndex from './SettingsHubIndex';
import SettingsShell from './SettingsShell';

vi.mock('../../services', () => ({
  profileApi: {
    getMyProfile: vi.fn(),
  },
}));

vi.mock('../../services/payments.service', () => ({
  paymentsApi: {
    getBillingStatus: vi.fn(),
  },
}));

describe('SettingsHubIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExperimentStore.setState({ flags: {}, isLoaded: true });
    vi.mocked(profileApi.getMyProfile).mockResolvedValue({
      data: {
        username: 'EasyFeliu',
        fullName: 'Luis Feliu',
        avatar: null,
        isPrivate: false,
      },
    } as Awaited<ReturnType<typeof profileApi.getMyProfile>>);
    vi.mocked(paymentsApi.getBillingStatus).mockResolvedValue({
      subscription: { planName: 'Free' },
    });
  });

  it('sends Edit, plan, and visibility to the matching sections', async () => {
    const { i18n } = renderWithProviders(<SettingsHubIndex />);

    expect(
      await screen.findByRole('link', {
        name: i18n!.t('settings.hub.edit_profile'),
      }),
    ).toHaveAttribute('href', '/accounts/profile');
    expect(
      screen.getByRole('link', {
        name: i18n!.t('settings.hub.plan_a11y', { plan: 'Free' }),
      }),
    ).toHaveAttribute('href', '/accounts/billing');
    expect(
      screen.getByRole('link', {
        name: i18n!.t('settings.hub.privacy_a11y', {
          visibility: i18n!.t('settings.hub.public'),
        }),
      }),
    ).toHaveAttribute('href', '/accounts/privacy');
  });

  it('opens About this account from the hub', async () => {
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(<SettingsHubIndex />);

    const aboutBtn = await screen.findByRole('button', {
      name: (accessibleName) =>
        accessibleName.includes(i18n!.t('settings.hub.about')),
    });
    await user.click(aboutBtn);

    expect(
      await screen.findByRole('dialog', {
        name: i18n!.t('profile.about.title'),
      }),
    ).toBeInTheDocument();
  });

  it('lists Ads only while its flag is on (PD-084)', async () => {
    useExperimentStore.setState({ flags: {}, isLoaded: true });
    const off = renderWithProviders(<SettingsHubIndex />);
    await screen.findByRole('link', {
      name: off.i18n!.t('settings.tabs.feed_prefs.label'),
    });
    expect(
      screen.queryByRole('link', {
        name: off.i18n!.t('settings.tabs.ads.label'),
      }),
    ).not.toBeInTheDocument();
    off.unmount();

    useExperimentStore.setState({
      flags: { [ADS_CONSENT_FLAG]: true },
      isLoaded: true,
    });
    const on = renderWithProviders(<SettingsHubIndex />);
    expect(
      await screen.findByRole('link', {
        name: on.i18n!.t('settings.tabs.ads.label'),
      }),
    ).toHaveAttribute('href', '/accounts/ads');
  });

  it('shows log out at the bottom of the hub list', async () => {
    const { i18n } = renderWithProviders(<SettingsHubIndex />);

    expect(
      await screen.findByRole('button', {
        name: i18n!.t('settings.logout'),
      }),
    ).toBeInTheDocument();
  });
});

describe('SettingsShell', () => {
  it('hides the section rail on the hub index', () => {
    const { i18n } = renderWithProviders(
      <SettingsShell section={null}>
        <div>hub</div>
      </SettingsShell>,
    );

    expect(
      screen.queryByRole('navigation', {
        name: i18n!.t('settings.hub.nav_label'),
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-column')).toHaveClass(
      'max-w-xl',
      'mx-auto',
    );
  });

  it('shows the section rail inside a section', () => {
    const { i18n } = renderWithProviders(
      <SettingsShell section="profile">
        <div>profile</div>
      </SettingsShell>,
    );

    expect(
      screen.getByRole('navigation', {
        name: i18n!.t('settings.hub.nav_label'),
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: i18n!.t('settings.hub.back'),
      }),
    ).toHaveAttribute('href', '/accounts');
    expect(screen.getByTestId('settings-column')).toHaveClass('max-w-5xl');
  });

  it('leaves Ads out of the section rail while its flag is off', () => {
    useExperimentStore.setState({ flags: {}, isLoaded: true });
    const { i18n } = renderWithProviders(
      <SettingsShell section="profile">
        <div>profile</div>
      </SettingsShell>,
    );

    expect(
      screen.getByRole('link', {
        name: i18n!.t('settings.tabs.feed_prefs.label'),
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: i18n!.t('settings.tabs.ads.label'),
        hidden: true,
      }),
    ).not.toBeInTheDocument();
  });
});
