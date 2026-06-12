import { useCallback, useEffect, useState } from 'react';
import { pushApi } from '../services';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' ? Notification.permission : 'default',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setIsSubscribed(!!subscription);
  }, []);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  async function requestPermission() {
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        await subscribeUser();
      }
    } catch (err) {
      console.error('Permission request failed', err);
    } finally {
      setLoading(false);
    }
  }

  async function subscribeUser() {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Get public key from server
      const { data } = await pushApi.getPublicKey();
      const publicKey = data.publicKey;

      // Subscribe to push service
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send to backend
      await pushApi.subscribe(subscription);
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Subscription failed', err);
      return false;
    }
  }

  async function unsubscribeUser() {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await pushApi.unsubscribe(subscription.endpoint);
        setIsSubscribed(false);
      }
    } catch (err) {
      console.error('Unsubscription failed', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    permission,
    isSubscribed,
    loading,
    requestPermission,
    unsubscribeUser,
  };
}

// Utility to convert VAPID public key
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
