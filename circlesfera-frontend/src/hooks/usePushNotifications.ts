import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services';
import { useAuthStore } from '../stores/authStore';
import {
  forgetNativePushToken,
  nativePushOff,
  rememberNativePushToken,
  setNativePushOff,
} from '../utils/nativePush';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// What the phone says about notifications, in the browser's words: allowed,
// blocked, or not decided yet.
function nativePermission(receive: string): NotificationPermission {
  return receive === 'granted' || receive === 'denied' ? receive : 'default';
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isNative = Capacitor.isNativePlatform();
  // Push reaches the iOS app through Apple. The Android app has no push: on
  // Android it is the web app in the browser that receives it.
  const isAndroidApp = isNative && Capacitor.getPlatform() === 'android';
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const checkSubscription = useCallback(async () => {
    try {
      if (isNative) {
        // On while the phone allows it, unless the person turned it off here.
        const status = await PushNotifications.checkPermissions();
        setPermission(nativePermission(status.receive));
        setIsSubscribed(status.receive === 'granted' && !nativePushOff());
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      }
    } catch (error) {
      console.error('Error checking push subscription', error);
    }
  }, [isNative]);

  useEffect(() => {
    if (isAndroidApp) return;
    if (isNative) {
      setIsSupported(true);
      checkSubscription();

      // Setup native listeners
      // The Apple device token of this iPhone or iPad.
      PushNotifications.addListener('registration', (token) => {
        rememberNativePushToken(token.value);
        api
          .post('/push/subscribe-native', {
            token: token.value,
            platform: Capacitor.getPlatform(),
          })
          .catch(console.error);
        setIsSubscribed(true);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error(`Error on registration: ${JSON.stringify(error)}`);
      });
    } else if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
      checkSubscription();
    }
  }, [checkSubscription, isAndroidApp, isNative]);

  // Apple asks that the app register on every launch: the token can change,
  // and signing out took this phone off. Once a person is signed in on an
  // iPhone that allows push, the phone registers again, unless push was
  // turned off here.
  useEffect(() => {
    if (!isNative || isAndroidApp || !isAuthenticated || nativePushOff()) {
      return;
    }
    PushNotifications.checkPermissions()
      .then((status) =>
        status.receive === 'granted' ? PushNotifications.register() : undefined,
      )
      .catch((error) => console.error('Error registering for push', error));
  }, [isAndroidApp, isAuthenticated, isNative]);

  const subscribe = async () => {
    if (isAndroidApp) return false;
    setIsLoading(true);
    try {
      if (isNative) {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          setPermission(nativePermission(permStatus.receive));
          throw new Error('User denied native permissions');
        }
        setPermission('granted');
        setNativePushOff(false);
        await PushNotifications.register(); // This will trigger the 'registration' listener
        return true;
      } else {
        const permissionResult = await Notification.requestPermission();
        setPermission(permissionResult);

        if (permissionResult !== 'granted') {
          throw new Error('Permission not granted for web push notifications');
        }

        const registration = await navigator.serviceWorker.ready;
        const { data } = await api.get('/push/public-key');
        const vapidPublicKey = data.publicKey;
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });

        await api.post('/push/subscribe', subscription.toJSON());
        setIsSubscribed(true);
        return true;
      }
    } catch (error) {
      console.error('Failed to subscribe to push notifications', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    try {
      if (isNative) {
        setNativePushOff(true);
        await forgetNativePushToken();
        setIsSubscribed(false);
        return true;
      } else {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          await api.delete(
            `/push/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`,
          );
          setIsSubscribed(false);
        }
        return true;
      }
    } catch (error) {
      console.error('Failed to unsubscribe', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isSupported,
    isAndroidApp,
    permission,
    isSubscribed,
    loading: isLoading,
    requestPermission: subscribe,
    unsubscribeUser: unsubscribe,
    hasServiceWorker: true, // For NotificationsSettings compatibility
  };
}
