// An app kept open for days, as one added to the home screen is, keeps the
// version it opened with. Each time it comes back to the screen it asks for a
// newer one. A newer one is downloaded and waits: the version serving the
// page keeps every file it needs, so a screen opened from memory (a video
// handed from Edits to Create) still loads. On the next move to a screen
// that holds nothing in memory, the newer one takes over and the page loads
// it.
const SKIP_WAITING = { type: 'SKIP_WAITING' } as const;

// A newer version installed and waiting to take over.
let waiting: ServiceWorker | null = null;
// The page loads again once the newer version serves it.
let loadOnTakeOver = false;

/**
 * Lets a waiting newer version take over, and loads the page once it does;
 * true when there was one. Without a connection the page could not load
 * again, so the newer version keeps waiting for a screen change online.
 */
export function loadAppUpdate(
  online: () => boolean = () => navigator.onLine,
): boolean {
  if (!waiting || !online()) return false;
  const worker = waiting;
  waiting = null;
  loadOnTakeOver = true;
  worker.postMessage(SKIP_WAITING);
  return true;
}

export function watchForAppUpdates(
  container: ServiceWorkerContainer,
  doc: Pick<Document, 'visibilityState' | 'addEventListener'> = document,
  reload: () => void = () => window.location.reload(),
  scriptUrl = '/service-worker.js',
): Promise<void> {
  container.addEventListener('controllerchange', () => {
    if (!loadOnTakeOver) return;
    loadOnTakeOver = false;
    reload();
  });

  // Only a version that waits behind another one is an update: the first
  // one ever installed serves the page on its own, and the page already runs
  // the newest code.
  const wait = (worker: ServiceWorker | null) => {
    if (worker && container.controller) waiting = worker;
  };
  const follow = (worker: ServiceWorker | null) => {
    if (!worker) return;
    if (worker.state === 'installed') {
      wait(worker);
      return;
    }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') wait(worker);
    });
  };

  return container
    .register(scriptUrl)
    .then((registration) => {
      wait(registration.waiting);
      // One may already be installing before the page asks.
      follow(registration.installing);
      registration.addEventListener('updatefound', () =>
        follow(registration.installing),
      );
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

/** Test-only: forgets a waiting version. */
export function resetAppUpdatesForTest(): void {
  waiting = null;
  loadOnTakeOver = false;
}
