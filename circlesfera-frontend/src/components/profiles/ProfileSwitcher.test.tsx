import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import ProfileSwitcher from './ProfileSwitcher';

vi.mock('../../services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services')>();
  return { ...actual, profileApi: { getMyProfiles: vi.fn() } };
});

describe('ProfileSwitcher', () => {
  beforeEach(() => {
    useAuthStore.setState({
      profile: { id: 'p-main', username: 'ana' } as never,
    });
    vi.mocked(profileApi.getMyProfiles).mockResolvedValue({
      data: [
        {
          id: 'p-main',
          username: 'ana',
          fullName: null,
          avatar: null,
          accountType: 'PERSONAL',
          isAccountBanned: false,
          isSuspended: false,
          suspendedUntil: null,
        },
        {
          id: 'p-shop',
          username: 'ana.shop',
          fullName: null,
          avatar: null,
          accountType: 'BUSINESS',
          isAccountBanned: false,
          isSuspended: false,
          suspendedUntil: null,
        },
      ],
    } as never);
  });

  it('the own username opens the profile list with a link to manage them', async () => {
    const user = userEvent.setup();
    const { i18n } = renderWithProviders(<ProfileSwitcher username="ana" />);

    expect(profileApi.getMyProfiles).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.profiles.switcher_open_a11y', {
          username: 'ana',
        }),
      }),
    );

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(await screen.findByText('@ana.shop')).toBeVisible();
    expect(
      screen.getByRole('link', { name: i18n!.t('settings.profiles.manage') }),
    ).toHaveAttribute('href', '/accounts/profiles');
  });
});
