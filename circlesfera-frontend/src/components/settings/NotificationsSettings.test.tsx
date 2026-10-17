import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { usersApi } from '../../services/users.service';
import { renderWithProviders } from '../../test/test-utils';
import NotificationsSettings from './NotificationsSettings';

vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}));

vi.mock('../../services/users.service', () => ({
  usersApi: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('NotificationsSettings', () => {
  const requestPermission = vi.fn();
  const unsubscribeUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersApi.getSettings).mockResolvedValue({
      data: { pushNotifications: true, emailNotifications: true },
    } as never);
    vi.mocked(usePushNotifications).mockReturnValue({
      isSupported: true,
      hasServiceWorker: false,
      permission: 'granted',
      isSubscribed: false,
      loading: false,
      requestPermission,
      unsubscribeUser,
    });
  });

  it('shows a failure toast and keeps native alerts off when subscribe fails', async () => {
    requestPermission.mockResolvedValue(false);

    const { i18n } = renderWithProviders(<NotificationsSettings />);

    const toggle = await screen.findByRole('switch', {
      name: i18n!.t('settings.notifications_tab.native_alerts'),
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });
    expect(toast.error).toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('does not show an error toast for a duplicate click while enabling', async () => {
    let resolveSubscribe: (value: boolean) => void = () => {};
    requestPermission.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubscribe = resolve;
        }),
    );

    const { i18n } = renderWithProviders(<NotificationsSettings />);
    const toggle = await screen.findByRole('switch', {
      name: i18n!.t('settings.notifications_tab.native_alerts'),
    });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();

    await act(async () => {
      resolveSubscribe(true);
    });

    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('turns native alerts on after a successful subscribe', async () => {
    requestPermission.mockResolvedValue(true);

    const { i18n, rerender } = renderWithProviders(<NotificationsSettings />);

    const toggle = await screen.findByRole('switch', {
      name: i18n!.t('settings.notifications_tab.native_alerts'),
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });
    expect(toast.success).toHaveBeenCalled();

    vi.mocked(usePushNotifications).mockReturnValue({
      isSupported: true,
      hasServiceWorker: true,
      permission: 'granted',
      isSubscribed: true,
      loading: false,
      requestPermission,
      unsubscribeUser,
    });
    rerender(<NotificationsSettings />);

    expect(
      screen.getByRole('switch', {
        name: i18n!.t('settings.notifications_tab.native_alerts'),
      }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the newsletter apart from the email notices and saves it on its own', async () => {
    vi.mocked(usersApi.getSettings).mockResolvedValue({
      data: {
        pushNotifications: true,
        emailNotifications: true,
        newsletter: true,
      },
    } as never);
    vi.mocked(usersApi.updateSettings).mockResolvedValue({} as never);

    const { i18n } = renderWithProviders(<NotificationsSettings />);

    const newsletter = await screen.findByRole('checkbox', {
      name: i18n!.t('settings.notifications.newsletter'),
    });
    expect(newsletter).toBeChecked();
    fireEvent.click(newsletter);

    await waitFor(() =>
      expect(usersApi.updateSettings).toHaveBeenCalledWith({
        newsletter: false,
      }),
    );
    expect(newsletter).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: i18n!.t('settings.notifications.email_notifications'),
      }),
    ).toBeChecked();
  });

  it('shows the pause and the five push groups of the profile, as saved', async () => {
    vi.mocked(usersApi.getSettings).mockResolvedValue({
      data: {
        pushNotifications: true,
        pushLikes: false,
        pushComments: true,
        pushFollows: true,
        pushMessages: false,
        pushLive: true,
      },
    } as never);

    const { i18n } = renderWithProviders(<NotificationsSettings />);
    const t = (k: string) => i18n!.t(`settings.notifications.${k}`);

    const pause = await screen.findByRole('checkbox', { name: t('pause_all') });
    expect(pause).not.toBeChecked();
    const expected = {
      likes: false,
      comments: true,
      follows: true,
      messages: false,
      live: true,
    };
    for (const [group, on] of Object.entries(expected)) {
      const box = screen.getByRole('checkbox', {
        name: t(`push_group.${group}`),
      });
      expect((box as HTMLInputElement).checked).toBe(on);
      expect(box).toBeEnabled();
    }
    expect(screen.getByText(t('push_always'))).toBeInTheDocument();
  });

  it('saves one group on its own', async () => {
    vi.mocked(usersApi.updateSettings).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(<NotificationsSettings />);

    const live = await screen.findByRole('checkbox', {
      name: i18n!.t('settings.notifications.push_group.live'),
    });
    fireEvent.click(live);

    await waitFor(() =>
      expect(usersApi.updateSettings).toHaveBeenCalledWith({ pushLive: false }),
    );
    expect(live).not.toBeChecked();
  });

  it('pausing all push turns the profile push off and leaves the groups as they were, not to be changed', async () => {
    vi.mocked(usersApi.updateSettings).mockResolvedValue({} as never);
    const { i18n } = renderWithProviders(<NotificationsSettings />);
    const t = (k: string) => i18n!.t(`settings.notifications.${k}`);

    const pause = await screen.findByRole('checkbox', { name: t('pause_all') });
    fireEvent.click(pause);

    await waitFor(() =>
      expect(usersApi.updateSettings).toHaveBeenCalledWith({
        pushNotifications: false,
      }),
    );
    expect(pause).toBeChecked();
    const likes = screen.getByRole('checkbox', { name: t('push_group.likes') });
    expect(likes).toBeChecked();
    expect(likes).toBeDisabled();
  });
});
