export const PUSH_SW_READY_TIMEOUT_MS = 5000;
export const PROD_PUSH_SW_URL = '/service-worker.js';
export const DEV_PUSH_SW_URL = '/push-sw.js';

export type PushSubscribePayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export function pushServiceWorkerScriptUrl(): string {
  return import.meta.env.PROD ? PROD_PUSH_SW_URL : DEV_PUSH_SW_URL;
}

export async function getExistingPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

export function waitForServiceWorkerReady(
  timeoutMs = PUSH_SW_READY_TIMEOUT_MS,
): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    if (!('serviceWorker' in navigator)) {
      reject(new Error('SERVICE_WORKER_UNSUPPORTED'));
      return;
    }

    const timer = window.setTimeout(() => {
      reject(new Error('SERVICE_WORKER_TIMEOUT'));
    }, timeoutMs);

    navigator.serviceWorker.ready.then(
      (registration) => {
        window.clearTimeout(timer);
        resolve(registration);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Returns an active service worker registration, registering one if needed.
 * Never waits on `navigator.serviceWorker.ready` without a timeout — that
 * promise does not reject when no worker is registered (Vite dev).
 */
export async function ensurePushServiceWorker(
  timeoutMs = PUSH_SW_READY_TIMEOUT_MS,
): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('SERVICE_WORKER_UNSUPPORTED');
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) {
    return existing;
  }

  if (!existing) {
    await navigator.serviceWorker.register(pushServiceWorkerScriptUrl());
  }

  return waitForServiceWorkerReady(timeoutMs);
}

export function urlBase64ToUint8Array(
  base64String: string,
): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function toPushSubscribePayload(
  subscription: PushSubscription,
): PushSubscribePayload {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('INVALID_PUSH_SUBSCRIPTION');
  }

  // Strip browser extras such as expirationTime — the API DTO forbids
  // non-whitelisted fields.
  return { endpoint, keys: { p256dh, auth } };
}
