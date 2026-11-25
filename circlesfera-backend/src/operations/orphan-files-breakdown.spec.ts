import { describe, expect, it } from 'vitest';
import { breakdownUnusedFiles } from './orphan-files-breakdown.js';

const NOW = Date.UTC(2026, 10, 3);
const DAY_MS = 24 * 60 * 60 * 1000;
const OWN = '/uploads/0b9c1f8e-2d3a-4c5b-8e6f-7a8b9c0d1e2f.JPG';

const file = (url: string, days: number, sizeBytes: number) => ({
  url,
  sizeBytes,
  lastModified: new Date(NOW - days * DAY_MS),
});

describe('the breakdown of the files no row uses', () => {
  it('sorts them by name, kind, owner, age and size, in counts only', () => {
    const breakdown = breakdownUnusedFiles(
      [
        file(OWN, 3, 2048),
        file('/uploads/seed-avatar.png', 45, 50 * 1024),
        file('/uploads/README', 200, 2 * 1024 * 1024),
        file('/uploads/old-cover.png', 10, 500 * 1024),
      ],
      new Set([OWN]),
      NOW,
    );

    expect(breakdown).toEqual({
      shape: { storage_named: 1, other_name: 3 },
      extension: { jpg: 1, png: 2, none: 1 },
      owner: { with_owner: 1, no_owner: 3 },
      age: { lt_7d: 1, lt_30d: 1, lt_90d: 1, ge_90d: 1 },
      size: { lt_10kb: 1, lt_100kb: 1, lt_1mb: 1, ge_1mb: 1 },
    });
  });

  it('never carries a file name, and is empty for no files', () => {
    const breakdown = breakdownUnusedFiles(
      [file('/uploads/a-secret-name.png', 1, 1)],
      new Set(),
      NOW,
    );
    expect(JSON.stringify(breakdown)).not.toContain('secret');

    expect(breakdownUnusedFiles([], new Set(), NOW)).toEqual({
      shape: {},
      extension: {},
      owner: {},
      age: {},
      size: {},
    });
  });
});
