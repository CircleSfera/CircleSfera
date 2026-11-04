// An app kept open for days, as one added to the home screen is, keeps the
// version it opened with. Each time it comes back to the screen it asks for a
// newer one; a newer one takes over at once, and the page loads it on the
// next move to another screen, so nothing half done is lost.
const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

let updateReady = false;

/** Loads the new version if one took over; true when it does. */
export function reloadIfAppUpdated(
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!updateReady) return false;
  updateReady = false;
  reload();
  return true;
}

export function watchForAppUpdates(
  container: ServiceWorkerContainer,
  doc: Pick<Document, 'visibilityState' | 'addEventListener'> = document,
  scriptUrl = '/service-worker.js',
): Promise<void> {
  // The first version ever installed takes a page that had none: that page
  // already runs the newest code, so it is not an update.
  const hadVersion = Boolean(container.controller);
  container.addEventListener('controllerchange', () => {
    if (hadVersion) updateReady = true;
  });

  return container
    .register(scriptUrl)
    .then((registration) => {
      const letTakeOver = (worker: ServiceWorker | null) => {
        if (worker && container.controller) worker.postMessage(SKIP_WAITING);
      };
      letTakeOver(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') letTakeOver(worker);
        });
      });
      doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    })
    .catch((err) => {
      console.error('Service Worker registration failed:', err);
    });
}

/** Test-only: forgets a version that took over. */
export function resetAppUpdatesForTest(): void {
  updateReady = false;
}
