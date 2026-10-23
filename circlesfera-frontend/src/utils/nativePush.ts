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
  // Only the iOS app registers for push.
  if (Capacitor.getPlatform() !== 'ios') return;
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
