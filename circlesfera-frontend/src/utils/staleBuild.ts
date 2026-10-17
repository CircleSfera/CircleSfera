// After a deploy, a tab opened earlier asks for pieces of the app that no
// longer exist. Loading the page again gets the new ones. It is done once
// per tab and minute, so a piece that really is missing cannot loop.
const RELOAD_KEY = 'cs_stale_build_reload';
const RELOAD_WINDOW_MS = 60_000;

export function reloadOnceForStaleBuild(
  // Read inside the try: a browser that blocks storage throws on access.
  getStorage: () => Pick<Storage, 'getItem' | 'setItem'> = () =>
    window.sessionStorage,
  reload: () => void = () => window.location.reload(),
  now: number = Date.now(),
): boolean {
  try {
    const storage = getStorage();
    const last = Number(storage.getItem(RELOAD_KEY) ?? 0);
    if (now - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

export function watchForStaleBuild(target: Window = window): void {
  target.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForStaleBuild()) event.preventDefault();
  });
}
