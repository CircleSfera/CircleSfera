import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioProject } from '../types/studio';
import {
  clearLocalStudioDraft,
  loadLocalStudioDraft,
  saveLocalStudioDraft,
} from './studioLocalDraft';

// A browser database reduced to what the draft uses: one store, one key.
function fakeIndexedDb(
  options: { failOpen?: boolean; failWrite?: boolean } = {},
) {
  const kept = new Map<string, unknown>();
  const stores: string[] = [];
  const opened: string[] = [];
  const later = (run: () => void) => queueMicrotask(run);
  const db = {
    objectStoreNames: { contains: (name: string) => stores.includes(name) },
    createObjectStore: (name: string) => {
      stores.push(name);
    },
    close: vi.fn(),
    transaction: (_store: string, mode: string) => {
      const tx: Record<string, unknown> = { error: null };
      tx.objectStore = () => ({
        put: (value: unknown, key: string) => {
          later(() => {
            if (options.failWrite) return (tx.onerror as () => void)?.();
            kept.set(key, structuredClone(value));
            (tx.oncomplete as () => void)?.();
          });
        },
        delete: (key: string) => {
          later(() => {
            kept.delete(key);
            (tx.oncomplete as () => void)?.();
          });
        },
        get: (key: string) => {
          const req: Record<string, unknown> = {};
          later(() => {
            req.result = kept.get(key);
            (req.onsuccess as () => void)?.();
          });
          return req;
        },
      });
      opened.push(mode);
      return tx;
    },
  };
  return {
    kept,
    opened,
    db,
    indexedDB: {
      open: () => {
        const req: Record<string, unknown> = { result: db, error: null };
        later(() => {
          if (options.failOpen) return (req.onerror as () => void)?.();
          (req.onupgradeneeded as () => void)?.();
          (req.onsuccess as () => void)?.();
        });
        return req;
      },
    },
  };
}

const project = {
  id: 'project-1',
  tracks: [
    {
      id: 'track-1',
      clips: [
        { id: 'clip-1', type: 'video', file: new File(['x'], 'a.mp4') },
        { id: 'clip-2', type: 'text', text: 'Hello' },
      ],
    },
  ],
} as unknown as StudioProject;

describe('the local draft of the studio', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-06T07:08:09.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the project without its files, with its cloud project and when it was saved, and gives it back', async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal('indexedDB', fake.indexedDB);

    await saveLocalStudioDraft(project, 'cloud-7');
    const draft = await loadLocalStudioDraft();

    expect(draft?.cloudProjectId).toBe('cloud-7');
    expect(draft?.savedAt).toBe('2026-05-06T07:08:09.000Z');
    const clips = draft?.project.tracks[0].clips as unknown as {
      file?: unknown;
      text?: string;
    }[];
    // A file cannot be kept: the clip stays, its file does not.
    expect(clips[0].file).toBeNull();
    expect(clips[1].text).toBe('Hello');
    expect(fake.opened).toEqual(['readwrite', 'readonly']);
    expect(fake.db.close).toHaveBeenCalledTimes(2);
  });

  it('gives back nothing when no draft was kept, and after clearing it', async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal('indexedDB', fake.indexedDB);

    expect(await loadLocalStudioDraft()).toBeNull();

    await saveLocalStudioDraft(project, null);
    expect(await loadLocalStudioDraft()).not.toBeNull();
    await clearLocalStudioDraft();
    expect(await loadLocalStudioDraft()).toBeNull();
    expect(fake.kept.size).toBe(0);
  });

  it('gives back nothing for a record that is not a project', async () => {
    const fake = fakeIndexedDb();
    fake.kept.set('current', { project: { id: 'broken' }, savedAt: 'x' });
    vi.stubGlobal('indexedDB', fake.indexedDB);

    expect(await loadLocalStudioDraft()).toBeNull();
  });

  it.each([
    [
      'the browser has no local database',
      () => vi.stubGlobal('indexedDB', undefined),
    ],
    [
      'the database cannot be opened',
      () =>
        vi.stubGlobal('indexedDB', fakeIndexedDb({ failOpen: true }).indexedDB),
    ],
    [
      'the write fails',
      () =>
        vi.stubGlobal(
          'indexedDB',
          fakeIndexedDb({ failWrite: true }).indexedDB,
        ),
    ],
  ])('never stops the editor when %s', async (_case, arrange) => {
    arrange();

    await expect(saveLocalStudioDraft(project, null)).resolves.toBeUndefined();
    await expect(loadLocalStudioDraft()).resolves.toBeNull();
    await expect(clearLocalStudioDraft()).resolves.toBeUndefined();
  });
});
