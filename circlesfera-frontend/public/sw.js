self.addEventListener('push', (event) => {
  if (event.data) {
    const payload = event.data.json();
    const title = payload.title || 'Nueva Notificación';
    const options = {
      body: payload.body || 'Tienes una nueva alerta en CircleSfera',
      icon: '/vite.svg', // using available icon
      badge: '/vite.svg',
      data: payload.data || {},
      vibrate: [200, 100, 200],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = new URL(
    event.notification.data?.url || '/',
    self.location.origin,
  ).href;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        let matchingClient = null;
        for (let i = 0; i < windowClients.length; i++) {
          const windowClient = windowClients[i];
          if (windowClient.url === urlToOpen) {
            matchingClient = windowClient;
            break;
          }
        }
        if (matchingClient) {
          return matchingClient.focus();
        } else {
          return clients.openWindow(urlToOpen);
        }
      }),
  );
});
