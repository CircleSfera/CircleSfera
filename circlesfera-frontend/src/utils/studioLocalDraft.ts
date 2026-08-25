/**
 * Local IndexedDB buffer for Studio projects before/alongside cloud drafts.
 * Survives refresh when media is still blob: URLs (cloud autosave cannot run yet).
 */

import type { StudioProject } from '../types/studio';
import { serializeStudioProject } from './studioProject';

const DB_NAME = 'circlesfera-studio';
const DB_VERSION = 1;
const STORE = 'localDraft';
const DRAFT_KEY = 'current';

export type LocalStudioDraft = {
  project: StudioProject;
  cloudProjectId: string | null;
  savedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveLocalStudioDraft(
  project: StudioProject,
  cloudProjectId: string | null,
): Promise<void> {
  try {
    const db = await openDb();
    const serialized = serializeStudioProject(project);
    const record: LocalStudioDraft = {
      project: serialized,
      cloudProjectId,
      savedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB write failed'));
      tx.objectStore(STORE).put(record, DRAFT_KEY);
    });
    db.close();
  } catch {
    // Best-effort — never block editing
  }
}

export async function loadLocalStudioDraft(): Promise<LocalStudioDraft | null> {
  try {
    const db = await openDb();
    const record = await new Promise<LocalStudioDraft | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(DRAFT_KEY);
        req.onsuccess = () =>
          resolve((req.result as LocalStudioDraft | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error('IDB read failed'));
      },
    );
    db.close();
    if (!record?.project?.tracks) return null;
    return record;
  } catch {
    return null;
  }
}

export async function clearLocalStudioDraft(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB clear failed'));
      tx.objectStore(STORE).delete(DRAFT_KEY);
    });
    db.close();
  } catch {
    // ignore
  }
}
