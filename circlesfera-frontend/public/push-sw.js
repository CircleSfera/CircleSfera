/* Development / fallback push worker.
 * Production uses src/service-worker.ts (VitePWA injectManifest).
 * Vite does not register a service worker in `npm run dev`, and
 * navigator.serviceWorker.ready never resolves without one — which
 * left the Native Alerts toggle stuck in a loading/off state.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, data } = payload;

    event.waitUntil(
      self.registration.showNotification(title || 'CircleSfera', {
        body: body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: data || {},
        vibrate: [200, 100, 200],
        tag: data?.type || 'general',
        renotify: true,
      }),
    );
  } catch (err) {
    console.error('Push event error:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      }),
  );
});
