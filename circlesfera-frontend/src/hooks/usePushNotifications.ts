import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services';

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

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  const checkSubscription = useCallback(async () => {
    try {
      if (isNative) {
        // We assume subscribed if permission is granted in native
        const status = await PushNotifications.checkPermissions();
        setPermission(status.receive === 'granted' ? 'granted' : 'default');
        setIsSubscribed(status.receive === 'granted');
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
    if (isNative) {
      setIsSupported(true);
      checkSubscription();

      // Setup native listeners
      PushNotifications.addListener('registration', (token) => {
        // Send native APNs/FCM token to backend
        // Note: Backend must adapt to handle APNs/FCM tokens alongside WebPush
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
  }, [checkSubscription, isNative]);

  const subscribe = async () => {
    setIsLoading(true);
    try {
      if (isNative) {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          throw new Error('User denied native permissions');
        }
        setPermission('granted');
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
        // Capacitor Push Notifications don't have a direct "unregister" method currently
        // Usually, you delete the token from the backend database.
        await api.delete(
          `/push/unsubscribe-native?platform=${Capacitor.getPlatform()}`,
        );
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
    permission,
    isSubscribed,
    loading: isLoading,
    requestPermission: subscribe,
    unsubscribeUser: unsubscribe,
    hasServiceWorker: true, // For NotificationsSettings compatibility
  };
}
