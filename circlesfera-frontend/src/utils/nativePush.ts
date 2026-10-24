import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiClient } from '../services/api';

// The device's push token, kept on the device so that the device itself can
// be taken off later (on sign-out, or when push is turned off).
const KEY = 'cs_native_push_token';

export function rememberNativePushToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Storage may be unavailable; the token is then not taken off later.
  }
}

// Set when the person turns push off with the switch, so that the phone is
// not registered again for them on the next launch while the system still
// allows it. Kept per account (User.id, which push tokens belong to on the
// server): another person signing in on the same phone gets push if the
// phone allows it.
const OFF = 'cs_native_push_off:';

export function nativePushOff(account: string | null | undefined): boolean {
  if (!account) return false;
  try {
    return localStorage.getItem(OFF + account) === '1';
  } catch {
    return false;
  }
}

export function setNativePushOff(
  account: string | null | undefined,
  off: boolean,
) {
  if (!account) return;
  try {
    if (off) localStorage.setItem(OFF + account, '1');
    else localStorage.removeItem(OFF + account);
  } catch {
    // Storage may be unavailable; the phone then registers on each launch.
  }
}

function storedToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Takes this device off push for the person signed in: the server forgets
 * its token and the phone stops receiving. Called while the session is still
 * valid. Does nothing outside the iOS app.
 */
export async function forgetNativePushToken(): Promise<void> {
  // Only the iOS app registers for push. Elsewhere only a token left on the
  // device by an earlier version is cleared, with no call to the server.
  if (Capacitor.getPlatform() !== 'ios') {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing to remove.
    }
    return;
  }
  const token = storedToken();
  try {
    if (token) {
      await apiClient.delete('/push/unsubscribe-native', {
        params: { token },
      });
    }
  } catch {
    // The session may already be gone; the server drops dead tokens itself.
  }
  try {
    await PushNotifications.unregister();
  } catch {
    // Not registered.
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to remove.
  }
}
