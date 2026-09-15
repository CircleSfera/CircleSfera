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
});
