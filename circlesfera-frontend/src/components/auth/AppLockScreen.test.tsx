import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../stores/authStore';
import { useSecurityStore } from '../../stores/securityStore';
import { renderWithProviders } from '../../test/test-utils';
import { AppLockScreen } from './AppLockScreen';

const device = vi.hoisted(() => ({
  isNative: true,
  verifyIdentity: vi.fn(),
  impact: vi.fn(),
  notification: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => device.isNative },
}));
vi.mock('@capgo/capacitor-native-biometric', () => ({
  NativeBiometric: { verifyIdentity: device.verifyIdentity },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: device.impact, notification: device.notification },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Error: 'ERROR' },
}));

const logout = vi.fn();
const security = () => useSecurityStore.getState();
const lock = (isBiometricEnabled = true) =>
  useSecurityStore.setState({ isLocked: true, isBiometricEnabled });

describe('AppLockScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    device.isNative = true;
    device.verifyIdentity.mockResolvedValue(undefined);
    device.impact.mockResolvedValue(undefined);
    device.notification.mockResolvedValue(undefined);
    logout.mockResolvedValue(undefined);
    useAuthStore.setState({ logout });
    useSecurityStore.setState({ isLocked: false, isBiometricEnabled: false });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('is not there while the app is unlocked, and asks the device nothing', () => {
    const { container } = renderWithProviders(<AppLockScreen />);
    expect(container).toBeEmptyDOMElement();
    expect(device.verifyIdentity).not.toHaveBeenCalled();
  });

  it('asks the device to verify the person as soon as the app is locked, and unlocks', async () => {
    lock();
    renderWithProviders(<AppLockScreen />);

    await waitFor(() => expect(security().isLocked).toBe(false));
    expect(device.verifyIdentity).toHaveBeenCalledWith({
      reason: 'Unlock CircleSfera',
      title: 'Authentication required',
      subtitle: 'Verify your identity',
      description: 'Use Face ID or Touch ID to unlock.',
    });
    expect(device.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
  });

  it('stays locked and says so when the person is not verified, and can try again', async () => {
    device.verifyIdentity.mockRejectedValueOnce(new Error('cancelled'));
    lock();
    renderWithProviders(<AppLockScreen />);

    expect(
      await screen.findByText('Authentication failed. Try again.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'App locked' }),
    ).toBeInTheDocument();
    expect(security().isLocked).toBe(true);
    expect(device.notification).toHaveBeenCalledWith({ type: 'ERROR' });

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(security().isLocked).toBe(false));
    expect(device.verifyIdentity).toHaveBeenCalledTimes(2);
  });

  it('works on a device that cannot vibrate', async () => {
    device.impact.mockRejectedValue(new Error('no haptics'));
    device.notification.mockRejectedValue(new Error('no haptics'));
    device.verifyIdentity.mockRejectedValueOnce(new Error('cancelled'));
    lock();
    renderWithProviders(<AppLockScreen />);
    await screen.findByText('Authentication failed. Try again.');

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(security().isLocked).toBe(false));
  });

  it('waits for the button when the lock is on without the automatic check', async () => {
    lock(false);
    renderWithProviders(<AppLockScreen />);
    expect(screen.getByText(/CircleSfera is locked/)).toBeInTheDocument();
    expect(device.verifyIdentity).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(security().isLocked).toBe(false));
  });

  it('unlocks without asking in a browser, which has no device check', async () => {
    device.isNative = false;
    lock();
    renderWithProviders(<AppLockScreen />);

    await waitFor(() => expect(security().isLocked).toBe(false));
    expect(device.verifyIdentity).not.toHaveBeenCalled();
  });

  it('signs out and lifts the lock for someone who cannot unlock', async () => {
    device.verifyIdentity.mockRejectedValue(new Error('cancelled'));
    lock();
    renderWithProviders(<AppLockScreen />);
    await screen.findByText('Authentication failed. Try again.');

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(security().isLocked).toBe(false));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
