import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.fn(() => 'ios');
const unregister = vi.fn().mockResolvedValue(undefined);
const del = vi.fn().mockResolvedValue({});

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform() },
}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { unregister: () => unregister() },
}));
vi.mock('../services/api', () => ({
  apiClient: { delete: (...a: unknown[]) => del(...a) },
}));

import { forgetNativePushToken, rememberNativePushToken } from './nativePush';

describe('native push token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    platform.mockReturnValue('ios');
  });

  it('takes this device off: the server forgets its token and the phone stops', async () => {
    rememberNativePushToken('a1b2');

    await forgetNativePushToken();

    expect(del).toHaveBeenCalledWith('/push/unsubscribe-native', {
      params: { token: 'a1b2' },
    });
    expect(unregister).toHaveBeenCalled();
    expect(localStorage.getItem('cs_native_push_token')).toBeNull();
  });

  it('still stops the phone when the server cannot be told', async () => {
    rememberNativePushToken('a1b2');
    del.mockRejectedValueOnce(new Error('401'));

    await expect(forgetNativePushToken()).resolves.toBeUndefined();
    expect(unregister).toHaveBeenCalled();
  });

  it('asks the server nothing without a token, and nothing outside the iOS app', async () => {
    await forgetNativePushToken();
    expect(del).not.toHaveBeenCalled();

    // The web, and the Android app, which has no push.
    for (const other of ['web', 'android']) {
      platform.mockReturnValue(other);
      rememberNativePushToken('a1b2');
      await forgetNativePushToken();
    }
    expect(del).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
