import * as path from 'node:path';
import type { StorageFileMeta } from '../interfaces/storage-provider.interface.js';
import {
  ORPHAN_DELETIONS_PER_NIGHT,
  ORPHAN_GRACE_HOURS,
  ORPHAN_MAX_SHARE,
  ORPHAN_SHARE_WINDOW_DAYS,
} from './orphan-sweep.policy.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface OrphanMediaItem {
  url: string;
  lastModified: Date;
  ageHours: number;
  sizeBytes?: number;
}

export interface OrphanSweepInput {
  /** The files the storage lists. */
  files: readonly StorageFileMeta[];
  /** Every address and file name a row names (MEDIA_COLUMNS). */
  referenced: ReadonlySet<string>;
  /** The files of content deleted less than DELETED_CONTENT_KEPT_DAYS ago. */
  kept: ReadonlySet<string>;
  /** Whether the storage deletes this address (its own shape of file). */
  owns: (url: string) => boolean;
  now?: number;
  olderThanHours?: number;
  maxDeletions?: number;
}

/** What the nightly sweep decides about the files it is given. */
export interface OrphanSweepPlan {
  scanned: number;
  /** Listed files this storage does not delete (another shape, a subfolder). */
  foreign: number;
  used: number;
  keptDeleted: number;
  /** Unused, but within the grace period or of unknown age: kept. */
  unusedRecent: number;
  /** Unused for longer than the grace period. */
  orphans: OrphanMediaItem[];
  /** Why nothing would be deleted although files are unused. */
  heldBack?: string;
  /** The same, as data: its kind and the share it measured. */
  hold?: {
    reason: 'no_references' | 'share_exceeded';
    recentOrphans: number;
    recentFiles: number;
  };
  /** What one run would send for deletion, the oldest first. */
  toDelete: OrphanMediaItem[];
}

/**
 * The rules of the nightly orphan sweep, in one place: the sweep acts on
 * them and the Operations report shows them, so the report counts exactly
 * what the sweep would do. It decides; it reads and writes nothing.
 */
export function planOrphanSweep(input: OrphanSweepInput): OrphanSweepPlan {
  const now = input.now ?? Date.now();
  const olderThanHours = input.olderThanHours ?? ORPHAN_GRACE_HOURS;
  const maxDeletions = input.maxDeletions ?? ORPHAN_DELETIONS_PER_NIGHT;
  const cutoff = now - olderThanHours * HOUR_MS;

  const plan: OrphanSweepPlan = {
    scanned: input.files.length,
    foreign: 0,
    used: 0,
    keptDeleted: 0,
    unusedRecent: 0,
    orphans: [],
    toDelete: [],
  };

  for (const file of input.files) {
    // Only a file this storage deletes is weighed: a video's stream in its
    // subfolder, or a file of another shape, is never an orphan here.
    if (!input.owns(file.url)) {
      plan.foreign++;
      continue;
    }
    if (
      input.referenced.has(file.url) ||
      input.referenced.has(path.basename(file.url))
    ) {
      plan.used++;
      continue;
    }
    if (input.kept.has(file.url)) {
      plan.keptDeleted++;
      continue;
    }
    // A recent file may be an upload in progress; one of unknown age too.
    if (!file.lastModified || file.lastModified.getTime() > cutoff) {
      plan.unusedRecent++;
      continue;
    }
    plan.orphans.push({
      url: file.url,
      lastModified: file.lastModified,
      ageHours: Math.round((now - file.lastModified.getTime()) / HOUR_MS),
      sizeBytes: file.sizeBytes,
    });
  }

  if (plan.orphans.length === 0) return plan;

  // So many unused files among those stored lately means the references
  // were misread: nothing goes. Old leftovers are not counted.
  const windowStart = now - ORPHAN_SHARE_WINDOW_DAYS * DAY_MS;
  const recentFiles = input.files.filter(
    (file) =>
      input.owns(file.url) &&
      file.lastModified &&
      file.lastModified.getTime() >= windowStart,
  ).length;
  const recentOrphans = plan.orphans.filter(
    (orphan) => orphan.lastModified.getTime() >= windowStart,
  ).length;
  if (input.referenced.size === 0) {
    plan.heldBack = 'no row names any file';
    plan.hold = { reason: 'no_references', recentOrphans, recentFiles };
    return plan;
  }
  if (recentOrphans > recentFiles * ORPHAN_MAX_SHARE) {
    plan.heldBack = `${recentOrphans} of the ${recentFiles} files of the last ${ORPHAN_SHARE_WINDOW_DAYS} days are unused, past the share of ${ORPHAN_MAX_SHARE}`;
    plan.hold = { reason: 'share_exceeded', recentOrphans, recentFiles };
    return plan;
  }

  // The oldest first, and only so many in one run.
  plan.toDelete = [...plan.orphans]
    .sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime())
    .slice(0, Math.max(0, maxDeletions));
  return plan;
}
