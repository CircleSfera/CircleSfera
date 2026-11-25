import * as path from 'node:path';
import { LOCAL_UPLOAD_URL } from '../common/constants/local-upload.constants.js';
import type { FileOnDisk } from './stored-files-on-disk.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const KB = 1024;

/** Age groups, in days, the report sorts unused files into. */
export const AGE_GROUPS_DAYS = [7, 30, 90] as const;
/** Size groups, in bytes, the report sorts unused files into. */
export const SIZE_GROUPS_BYTES = [10 * KB, 100 * KB, KB * KB] as const;

/** How many of a group, by its key. */
export type Tally = Record<string, number>;

/**
 * What the files no row uses are, in counts only: whether the storage gave
 * them their name, their kind of file, whether the record knows who uploaded
 * them, how old and how large they are. Each group is keyed by a fixed key
 * (the page words it): `lt_7d` is under 7 days, `ge_90d` 90 days or more,
 * `lt_10kb` under 10 KB, `ge_1mb` 1 MB or more.
 */
export interface UnusedFilesBreakdown {
  shape: Tally;
  extension: Tally;
  owner: Tally;
  age: Tally;
  size: Tally;
}

function add(tally: Tally, key: string): void {
  tally[key] = (tally[key] ?? 0) + 1;
}

function groupOf(
  value: number,
  limits: readonly number[],
  key: (limit: number) => string,
  last: string,
): string {
  const limit = limits.find((bound) => value < bound);
  return limit === undefined ? last : key(limit);
}

function sizeKey(bytes: number): string {
  return bytes >= KB * KB ? `${bytes / KB / KB}mb` : `${bytes / KB}kb`;
}

export function breakdownUnusedFiles(
  files: readonly FileOnDisk[],
  owners: ReadonlySet<string>,
  now: number,
): UnusedFilesBreakdown {
  const breakdown: UnusedFilesBreakdown = {
    shape: {},
    extension: {},
    owner: {},
    age: {},
    size: {},
  };
  const lastAge = AGE_GROUPS_DAYS[AGE_GROUPS_DAYS.length - 1];
  const lastSize = SIZE_GROUPS_BYTES[SIZE_GROUPS_BYTES.length - 1];
  for (const file of files) {
    add(
      breakdown.shape,
      LOCAL_UPLOAD_URL.test(file.url) ? 'storage_named' : 'other_name',
    );
    add(
      breakdown.extension,
      path.extname(file.url).slice(1).toLowerCase() || 'none',
    );
    add(breakdown.owner, owners.has(file.url) ? 'with_owner' : 'no_owner');
    add(
      breakdown.age,
      groupOf(
        (now - file.lastModified.getTime()) / DAY_MS,
        AGE_GROUPS_DAYS,
        (days) => `lt_${days}d`,
        `ge_${lastAge}d`,
      ),
    );
    add(
      breakdown.size,
      groupOf(
        file.sizeBytes,
        SIZE_GROUPS_BYTES,
        (bytes) => `lt_${sizeKey(bytes)}`,
        `ge_${sizeKey(lastSize)}`,
      ),
    );
  }
  return breakdown;
}
