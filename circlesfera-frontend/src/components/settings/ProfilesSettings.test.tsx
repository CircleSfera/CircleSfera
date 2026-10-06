import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type OwnedProfile, profileApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import ProfilesSettings from './ProfilesSettings';

vi.mock('../../services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services')>();
  return {
    ...actual,
    profileApi: {
      getMyProfiles: vi.fn(),
      checkUsername: vi.fn(),
      createProfile: vi.fn(),
    },
  };
});

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const owned = (overrides: Partial<OwnedProfile>): OwnedProfile => ({
  id: 'p-main',
  username: 'ana',
  fullName: 'Ana',
  avatar: null,
  accountType: 'PERSONAL',
  isAccountBanned: false,
  isSuspended: false,
  suspendedUntil: null,
  ...overrides,
});

const profiles = [
  owned({}),
  owned({
    id: 'p-shop',
    username: 'ana.shop',
    fullName: null,
    accountType: 'BUSINESS',
  }),
  owned({ id: 'p-old', username: 'ana.old', isSuspended: true }),
  owned({ id: 'p-gone', username: 'ana.gone', isAccountBanned: true }),
];

const assign = vi.fn();
const switchProfile = vi.fn();
const originalLocation = window.location;

describe('ProfilesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    });
    useAuthStore.setState({
      profile: { id: 'p-main', username: 'ana' } as never,
      isAuthenticated: true,
      switchProfile,
    });
    switchProfile.mockResolvedValue(undefined);
    vi.mocked(profileApi.getMyProfiles).mockResolvedValue({
      data: profiles,
    } as never);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('lists the profiles with the current one and the unusable ones marked', async () => {
    const { i18n } = renderWithProviders(<ProfilesSettings />);

    expect(await screen.findByText('@ana.shop')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('settings.profiles.current')),
    ).toBeVisible();
    expect(
      screen.getByText(i18n!.t('settings.profiles.suspended')),
    ).toBeVisible();
    expect(screen.getByText(i18n!.t('settings.profiles.banned'))).toBeVisible();
    expect(screen.getByText('Business')).toBeVisible();

    // Only the usable other Profile can be switched to.
    const switchButtons = screen.getAllByRole('button', { name: /^Switch to/ });
    expect(switchButtons).toHaveLength(1);
    expect(switchButtons[0]).toHaveAccessibleName(
      i18n!.t('settings.profiles.switch_a11y', { username: 'ana.shop' }),
    );
  });

  it('switching reloads the app as the other profile', async () => {
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(<ProfilesSettings />);

    await user.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.profiles.switch_a11y', {
          username: 'ana.shop',
        }),
      }),
    );

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(switchProfile).toHaveBeenCalledWith('p-shop');
  });

  it('a failed switch stays on the page and says so', async () => {
    switchProfile.mockRejectedValue(new Error('403'));
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(<ProfilesSettings />);

    await user.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.profiles.switch_a11y', {
          username: 'ana.shop',
        }),
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('settings.profiles.switch_failed'),
      ),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    vi.mocked(profileApi.getMyProfiles)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ data: profiles } as never);
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(<ProfilesSettings />);

    await user.click(
      await screen.findByRole('button', {
        name: i18n!.t('settings.profiles.retry'),
      }),
    );

    expect(await screen.findByText('@ana.shop')).toBeInTheDocument();
  });

  it('blocks a sixth profile', async () => {
    vi.mocked(profileApi.getMyProfiles).mockResolvedValue({
      data: [...profiles, owned({ id: 'p-5', username: 'ana.five' })],
    } as never);
    const { i18n } = renderWithProviders(<ProfilesSettings />);

    expect(
      await screen.findByRole('button', {
        name: i18n!.t('settings.profiles.create'),
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(i18n!.t('settings.profiles.limit_reached', { max: 5 })),
    ).toBeVisible();
  });

  describe('creating a profile', () => {
    const openForm = async () => {
      const user = userEvent.setup();
      const rendered = renderWithProviders(<ProfilesSettings />);
      await user.click(
        await screen.findByRole('button', {
          name: rendered.i18n!.t('settings.profiles.create'),
        }),
      );
      const username = screen.getByLabelText(
        rendered.i18n!.t('settings.profiles.form.username'),
      );
      return { user, username, i18n: rendered.i18n! };
    };

    it('rejects an invalid username without asking the server', async () => {
      const { user, username, i18n } = await openForm();

      await user.type(username, 'a!');

      expect(
        await screen.findByText(
          i18n.t('settings.profiles.form.username_invalid'),
        ),
      ).toBeVisible();
      expect(profileApi.checkUsername).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', {
          name: i18n.t('settings.profiles.form.submit'),
        }),
      ).toBeDisabled();
    });

    it('says when the username is taken', async () => {
      vi.mocked(profileApi.checkUsername).mockResolvedValue({
        data: { available: false, message: '' },
      } as never);
      const { user, username, i18n } = await openForm();

      await user.type(username, 'taken.name');

      expect(
        await screen.findByText(
          i18n.t('settings.profiles.form.username_taken', {
            username: 'taken.name',
          }),
        ),
      ).toBeVisible();
      expect(
        screen.getByRole('button', {
          name: i18n.t('settings.profiles.form.submit'),
        }),
      ).toBeDisabled();
    });

    it('creates the profile with the chosen type and switches to it', async () => {
      vi.mocked(profileApi.checkUsername).mockResolvedValue({
        data: { available: true, message: '' },
      } as never);
      vi.mocked(profileApi.createProfile).mockResolvedValue({
        data: owned({ id: 'p-new', username: 'ana.art' }),
      } as never);
      const { user, username, i18n } = await openForm();

      await user.type(username, 'ana art');
      await user.type(
        screen.getByLabelText(i18n.t('settings.profiles.form.full_name')),
        '  Ana Art  ',
      );
      await user.click(screen.getByRole('radio', { name: /Creator/ }));
      expect(
        await screen.findByText(
          i18n.t('settings.profiles.form.username_available', {
            username: 'anaart',
          }),
        ),
      ).toBeVisible();
      await user.click(
        screen.getByRole('button', {
          name: i18n.t('settings.profiles.form.submit'),
        }),
      );

      await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
      expect(profileApi.createProfile).toHaveBeenCalledWith({
        username: 'anaart',
        fullName: 'Ana Art',
        accountType: 'CREATOR',
      });
      expect(switchProfile).toHaveBeenCalledWith('p-new');
    });

    it('a failed switch after creating keeps the new profile listed', async () => {
      vi.mocked(profileApi.checkUsername).mockResolvedValue({
        data: { available: true, message: '' },
      } as never);
      vi.mocked(profileApi.createProfile).mockResolvedValue({
        data: owned({ id: 'p-new', username: 'ana.new' }),
      } as never);
      switchProfile.mockRejectedValue(new Error('403'));
      const { user, username, i18n } = await openForm();
      vi.mocked(profileApi.getMyProfiles).mockResolvedValue({
        data: [...profiles, owned({ id: 'p-new', username: 'ana.new' })],
      } as never);

      await user.type(username, 'ana.new');
      await screen.findByText(
        i18n.t('settings.profiles.form.username_available', {
          username: 'ana.new',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: i18n.t('settings.profiles.form.submit'),
        }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n.t('settings.profiles.switch_failed'),
        ),
      );
      expect(toast.error).not.toHaveBeenCalledWith(
        i18n.t('settings.profiles.form.failed'),
      );
      expect(await screen.findByText('@ana.new')).toBeVisible();
      expect(
        screen.queryByLabelText(i18n.t('settings.profiles.form.username')),
      ).not.toBeInTheDocument();
      expect(profileApi.createProfile).toHaveBeenCalledTimes(1);
      expect(assign).not.toHaveBeenCalled();
    });

    it('a failed creation keeps the form and says so', async () => {
      vi.mocked(profileApi.checkUsername).mockResolvedValue({
        data: { available: true, message: '' },
      } as never);
      vi.mocked(profileApi.createProfile).mockRejectedValue(new Error('400'));
      const { user, username, i18n } = await openForm();

      await user.type(username, 'ana.new');
      await screen.findByText(
        i18n.t('settings.profiles.form.username_available', {
          username: 'ana.new',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: i18n.t('settings.profiles.form.submit'),
        }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n.t('settings.profiles.form.failed'),
        ),
      );
      expect(switchProfile).not.toHaveBeenCalled();
      expect(username).toHaveValue('ana.new');
    });

    it('cancel closes the form', async () => {
      const { user, i18n } = await openForm();

      await user.click(
        screen.getByRole('button', {
          name: i18n.t('settings.profiles.form.cancel'),
        }),
      );

      expect(
        screen.getByRole('button', {
          name: i18n.t('settings.profiles.create'),
        }),
      ).toBeVisible();
    });
  });

  it('is fully translated to Spanish', async () => {
    renderWithProviders(<ProfilesSettings />, { lng: 'es' });

    expect(await screen.findByText('Actual')).toBeVisible();
    expect(screen.getByText('Tus perfiles')).toBeVisible();
    expect(screen.getByText('Suspendido')).toBeVisible();
    expect(screen.getByText('Bloqueado')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Cambiar a @ana.shop' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Crear un perfil nuevo' }),
    ).toBeVisible();
  });
});
