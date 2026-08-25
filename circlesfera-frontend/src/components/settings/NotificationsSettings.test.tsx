import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { usersApi } from '../../services/users.service';
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

    render(<NotificationsSettings />);

    const toggle = await screen.findByRole('switch', {
      name: /native alerts/i,
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

    render(<NotificationsSettings />);
    const toggle = await screen.findByRole('switch', {
      name: /native alerts/i,
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

    const { rerender } = render(<NotificationsSettings />);

    const toggle = await screen.findByRole('switch', {
      name: /native alerts/i,
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
      screen.getByRole('switch', { name: /native alerts/i }),
    ).toHaveAttribute('aria-checked', 'true');
  });
});
