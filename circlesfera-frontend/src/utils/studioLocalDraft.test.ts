import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioProject } from '../types/studio';
import {
  clearLocalStudioDraft,
  loadLocalStudioDraft,
  saveLocalStudioDraft,
} from './studioLocalDraft';

// A small stand-in for the browser's database: one store kept in a Map, with
// requests and transactions that answer on a later turn, as the real ones do.
const later = (fn: () => void) => void Promise.resolve().then(fn);
const disk = {
  stores: new Map<string, Map<string, unknown>>(),
  failOpen: false,
  failWrite: false,
  failRead: false,
  closed: 0,
};
type Req = {
  result?: unknown;
  error?: Error | null;
  onsuccess?: () => void;
  onerror?: () => void;
  onupgradeneeded?: () => void;
};
const fakeIndexedDb = {
  open: () => {
    const req: Req = {};
    const db = {
      objectStoreNames: { contains: (name: string) => disk.stores.has(name) },
      createObjectStore: (name: string) => disk.stores.set(name, new Map()),
      close: () => {
        disk.closed += 1;
      },
      transaction: (name: string) => {
        const store = disk.stores.get(name) as Map<string, unknown>;
        const tx: {
          error: Error | null;
          oncomplete?: () => void;
          onerror?: () => void;
          objectStore: () => object;
        } = {
          error: null,
          objectStore: () => ({
            put: (value: unknown, key: string) => {
              if (disk.failWrite) return later(() => tx.onerror?.());
              store.set(key, value);
              later(() => tx.oncomplete?.());
            },
            delete: (key: string) => {
              if (disk.failWrite) return later(() => tx.onerror?.());
              store.delete(key);
              later(() => tx.oncomplete?.());
            },
            get: (key: string) => {
              const read: Req = {};
              later(() => {
                if (disk.failRead) return read.onerror?.();
                read.result = store.get(key);
                read.onsuccess?.();
              });
              return read;
            },
          }),
        };
        return tx;
      },
    };
    later(() => {
      if (disk.failOpen) return req.onerror?.();
      req.result = db;
      if (!disk.stores.has('localDraft')) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};

const project = (over: object = {}) =>
  ({
    id: 'pr-1',
    name: 'My edit',
    duration: 10,
    fps: 30,
    aspectRatio: '9:16',
    resolution: { width: 1080, height: 1920 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tracks: [
      {
        id: 't-1',
        clips: [
          { id: 'c-1', type: 'video', fileUrl: 'blob:local', file: new Blob() },
          { id: 'c-2', type: 'text', text: 'Hello' },
        ],
      },
    ],
    ...over,
  }) as unknown as StudioProject;

describe('the local draft of the studio', () => {
  beforeEach(() => {
    disk.stores = new Map();
    disk.failOpen = false;
    disk.failWrite = false;
    disk.failRead = false;
    disk.closed = 0;
    vi.stubGlobal('indexedDB', fakeIndexedDb);
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-05-01T12:00:00Z'),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('has nothing before anything was saved', async () => {
    expect(await loadLocalStudioDraft()).toBeNull();
  });

  it('keeps the project, its cloud id and when it was saved', async () => {
    await saveLocalStudioDraft(project(), 'cloud-1');

    const draft = await loadLocalStudioDraft();

    expect(draft?.cloudProjectId).toBe('cloud-1');
    expect(draft?.savedAt).toBe('2026-05-01T12:00:00.000Z');
    expect(draft?.project.name).toBe('My edit');
    expect(disk.closed).toBe(2);
  });

  it('keeps no file handles, which do not survive a reload, and leaves text as it is', async () => {
    await saveLocalStudioDraft(project(), null);

    const clips = (await loadLocalStudioDraft())?.project.tracks[0].clips as {
      file?: unknown;
      fileUrl?: string;
      text?: string;
    }[];

    expect(clips[0].file).toBeNull();
    expect(clips[0].fileUrl).toBe('blob:local');
    expect(clips[1]).toEqual({ id: 'c-2', type: 'text', text: 'Hello' });
  });

  it('replaces the draft with the newer one', async () => {
    await saveLocalStudioDraft(project(), null);
    await saveLocalStudioDraft(project({ name: 'Second' }), 'cloud-2');

    const draft = await loadLocalStudioDraft();

    expect(draft?.project.name).toBe('Second');
    expect(draft?.cloudProjectId).toBe('cloud-2');
  });

  it('forgets the draft when it is cleared', async () => {
    await saveLocalStudioDraft(project(), null);

    await clearLocalStudioDraft();

    expect(await loadLocalStudioDraft()).toBeNull();
  });

  it('treats a record without tracks as no draft', async () => {
    await saveLocalStudioDraft(project(), null);
    disk.stores.get('localDraft')?.set('current', { project: {} });

    expect(await loadLocalStudioDraft()).toBeNull();
  });

  it('never stops the editor when the device has no database', async () => {
    vi.stubGlobal('indexedDB', undefined);

    await expect(
      saveLocalStudioDraft(project(), null),
    ).resolves.toBeUndefined();
    await expect(clearLocalStudioDraft()).resolves.toBeUndefined();
    expect(await loadLocalStudioDraft()).toBeNull();
  });

  it('never stops the editor when the database cannot be opened', async () => {
    disk.failOpen = true;

    await expect(
      saveLocalStudioDraft(project(), null),
    ).resolves.toBeUndefined();
    await expect(clearLocalStudioDraft()).resolves.toBeUndefined();
    expect(await loadLocalStudioDraft()).toBeNull();
  });

  it('never stops the editor when a write or a read fails', async () => {
    await saveLocalStudioDraft(project(), null);

    disk.failWrite = true;
    await expect(
      saveLocalStudioDraft(project({ name: 'Lost' }), null),
    ).resolves.toBeUndefined();
    await expect(clearLocalStudioDraft()).resolves.toBeUndefined();
    disk.failRead = true;
    expect(await loadLocalStudioDraft()).toBeNull();

    // The draft from before is still there.
    disk.failRead = false;
    expect((await loadLocalStudioDraft())?.project.name).toBe('My edit');
  });
});
