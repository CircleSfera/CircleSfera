import * as path from 'node:path';
import { LOCAL_UPLOAD_URL } from '../common/constants/local-upload.constants.js';
import type { FileOnDisk } from './stored-files-on-disk.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const KB = 1024;

/** Age groups, in days, the report sorts unused files into. */
export const AGE_GROUPS_DAYS = [7, 30, 90] as const;
/** Size groups, in bytes, the report sorts unused files into. */
export const SIZE_GROUPS_BYTES = [10 * KB, 100 * KB, KB * KB] as const;

/** How many of a group, by its label. */
export type Tally = Record<string, number>;

/**
 * What the files no row uses are, in counts only (a public log may show
 * it): whether the storage gave them their name, their kind of file, whether
 * the record knows who uploaded them, how old and how large they are.
 */
export interface UnusedFilesBreakdown {
  shape: Tally;
  extension: Tally;
  owner: Tally;
  age: Tally;
  size: Tally;
}

function add(tally: Tally, label: string): void {
  tally[label] = (tally[label] ?? 0) + 1;
}

function groupOf(
  value: number,
  limits: readonly number[],
  label: (limit: number) => string,
  last: string,
): string {
  const limit = limits.find((bound) => value < bound);
  return limit === undefined ? last : label(limit);
}

function sizeLabel(bytes: number): string {
  return bytes >= KB * KB ? `${bytes / KB / KB} MB` : `${bytes / KB} KB`;
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
      LOCAL_UPLOAD_URL.test(file.url) ? 'named by the storage' : 'another name',
    );
    add(
      breakdown.extension,
      path.extname(file.url).slice(1).toLowerCase() || 'none',
    );
    add(
      breakdown.owner,
      owners.has(file.url) ? 'with an owner' : 'with no owner',
    );
    add(
      breakdown.age,
      groupOf(
        (now - file.lastModified.getTime()) / DAY_MS,
        AGE_GROUPS_DAYS,
        (days) => `under ${days} days`,
        `${lastAge} days or more`,
      ),
    );
    add(
      breakdown.size,
      groupOf(
        file.sizeBytes,
        SIZE_GROUPS_BYTES,
        (bytes) => `under ${sizeLabel(bytes)}`,
        `${sizeLabel(lastSize)} or more`,
      ),
    );
  }
  return breakdown;
}

/** The breakdown as lines for the report, each group sorted by count. */
export function breakdownLines(breakdown: UnusedFilesBreakdown): string[] {
  const titles: Record<keyof UnusedFilesBreakdown, string> = {
    shape: 'name',
    extension: 'kind',
    owner: 'owner',
    age: 'age',
    size: 'size',
  };
  return (Object.keys(titles) as Array<keyof UnusedFilesBreakdown>).map(
    (group) =>
      `    by ${titles[group]}: ${Object.entries(breakdown[group])
        .sort(([, a], [, b]) => b - a)
        .map(([label, count]) => `${label} ${count}`)
        .join(', ')}`,
  );
}
