import { beforeEach, describe, expect, it, vi } from 'vitest';

const isNative = vi.fn(() => true);
const unregister = vi.fn().mockResolvedValue(undefined);
const del = vi.fn().mockResolvedValue({});

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative() },
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
    isNative.mockReturnValue(true);
  });

  it('takes this device off: the server forgets its token and the phone stops', async () => {
    rememberNativePushToken('fcm-1');

    await forgetNativePushToken();

    expect(del).toHaveBeenCalledWith('/push/unsubscribe-native', {
      params: { token: 'fcm-1' },
    });
    expect(unregister).toHaveBeenCalled();
    expect(localStorage.getItem('cs_native_push_token')).toBeNull();
  });

  it('still stops the phone when the server cannot be told', async () => {
    rememberNativePushToken('fcm-1');
    del.mockRejectedValueOnce(new Error('401'));

    await expect(forgetNativePushToken()).resolves.toBeUndefined();
    expect(unregister).toHaveBeenCalled();
  });

  it('asks the server nothing without a token, and nothing outside the app', async () => {
    await forgetNativePushToken();
    expect(del).not.toHaveBeenCalled();

    isNative.mockReturnValue(false);
    rememberNativePushToken('fcm-1');
    await forgetNativePushToken();
    expect(del).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
