import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reloadIfAppUpdated,
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
  const watch = () =>
    watchForAppUpdates(
      container as unknown as ServiceWorkerContainer,
      doc as unknown as Document,
    );
  return { registration, container, doc, watch };
}

describe('watchForAppUpdates', () => {
  beforeEach(() => resetAppUpdatesForTest());

  it('lets a version found waiting take over at once', async () => {
    const b = browser({ controlled: true });
    const waiting = worker('installed');
    b.registration.waiting = waiting;
    await b.watch();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('lets a version that arrives while open take over once installed', async () => {
    const b = browser({ controlled: true });
    await b.watch();
    const arriving = worker();
    b.registration.installing = arriving;
    b.registration.emit('updatefound');
    expect(arriving.postMessage).not.toHaveBeenCalled();

    arriving.state = 'installed';
    arriving.emit('statechange');
    expect(arriving.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });
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

  it('loads the new version once, after it took over', async () => {
    const b = browser({ controlled: true });
    await b.watch();
    const reload = vi.fn();
    expect(reloadIfAppUpdated(reload)).toBe(false);

    b.container.emit('controllerchange');
    expect(reloadIfAppUpdated(reload)).toBe(true);
    expect(reloadIfAppUpdated(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload a page the very first version starts serving', async () => {
    const b = browser({ controlled: false });
    const first = worker('installed');
    b.registration.waiting = first;
    await b.watch();
    b.container.emit('controllerchange');

    expect(first.postMessage).not.toHaveBeenCalled();
    expect(reloadIfAppUpdated(vi.fn())).toBe(false);
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
