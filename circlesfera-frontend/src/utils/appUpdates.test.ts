import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadAppUpdate,
  resetAppUpdatesForTest,
  watchForAppUpdates,
} from './appUpdates';

type Listener = () => void;

function emitter() {
  const listeners = new Map<string, Listener[]>();
  return {
    addEventListener: (name: string, fn: Listener) =>
      listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    emit: (name: string) => {
      for (const fn of listeners.get(name) ?? []) fn();
    },
  };
}

function worker(state = 'installing') {
  return { ...emitter(), state, postMessage: vi.fn() };
}

// A browser's service workers: the version serving the page now, if any,
// and the registration a new version arrives through.
function browser({ controlled }: { controlled: boolean }) {
  const registration = {
    ...emitter(),
    waiting: null as ReturnType<typeof worker> | null,
    installing: null as ReturnType<typeof worker> | null,
    update: vi.fn(() => Promise.resolve()),
  };
  const container = {
    ...emitter(),
    controller: controlled ? {} : null,
    register: vi.fn(() => Promise.resolve(registration)),
  };
  const doc = { ...emitter(), visibilityState: 'visible' };
  const reload = vi.fn();
  const watch = () =>
    watchForAppUpdates(
      container as unknown as ServiceWorkerContainer,
      doc as unknown as Document,
      reload,
    );
  return { registration, container, doc, reload, watch };
}

describe('watchForAppUpdates', () => {
  beforeEach(() => resetAppUpdatesForTest());

  it('keeps a newer version waiting until the page lets it take over', async () => {
    const b = browser({ controlled: true });
    const waiting = worker('installed');
    b.registration.waiting = waiting;
    await b.watch();

    // Nothing is taken over on its own: the old files stay served.
    expect(waiting.postMessage).not.toHaveBeenCalled();

    expect(loadAppUpdate()).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(b.reload).not.toHaveBeenCalled();

    // The page loads once the newer version serves it, and only once.
    b.container.emit('controllerchange');
    b.container.emit('controllerchange');
    expect(b.reload).toHaveBeenCalledTimes(1);
    expect(loadAppUpdate()).toBe(false);
  });

  it('waits for a version that arrives while the app is open', async () => {
    const b = browser({ controlled: true });
    await b.watch();
    const arriving = worker();
    b.registration.installing = arriving;
    b.registration.emit('updatefound');
    expect(loadAppUpdate()).toBe(false);

    arriving.state = 'installed';
    arriving.emit('statechange');
    expect(loadAppUpdate()).toBe(true);
  });

  it('follows a version already installing when the page asks', async () => {
    const b = browser({ controlled: true });
    const installing = worker();
    b.registration.installing = installing;
    await b.watch();

    installing.state = 'installed';
    installing.emit('statechange');
    expect(loadAppUpdate()).toBe(true);
  });

  it('takes a version already installed when the page asks', async () => {
    const b = browser({ controlled: true });
    b.registration.installing = worker('installed');
    await b.watch();

    expect(loadAppUpdate()).toBe(true);
  });

  it('asks for a newer version each time the app comes back to the screen', async () => {
    const b = browser({ controlled: true });
    await b.watch();
    b.doc.visibilityState = 'hidden';
    b.doc.emit('visibilitychange');
    expect(b.registration.update).not.toHaveBeenCalled();

    b.doc.visibilityState = 'visible';
    b.doc.emit('visibilitychange');
    expect(b.registration.update).toHaveBeenCalledTimes(1);
  });

  it('treats the first version ever installed as no update, and a later one as one', async () => {
    const b = browser({ controlled: false });
    const first = worker();
    b.registration.installing = first;
    await b.watch();

    first.state = 'installed';
    first.emit('statechange');
    b.container.emit('controllerchange');
    expect(loadAppUpdate()).toBe(false);
    expect(b.reload).not.toHaveBeenCalled();

    // The first version now serves the page; the next deploy is an update.
    b.container.controller = {};
    const next = worker();
    b.registration.installing = next;
    b.registration.emit('updatefound');
    next.state = 'installed';
    next.emit('statechange');
    expect(loadAppUpdate()).toBe(true);
  });

  it('keeps the app running when the worker cannot be registered', async () => {
    const b = browser({ controlled: true });
    b.container.register.mockReturnValueOnce(Promise.reject(new Error('no')));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(b.watch()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
