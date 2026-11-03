import { describe, expect, it } from 'vitest';
import {
  breakdownLines,
  breakdownUnusedFiles,
} from './orphan-files-breakdown.js';

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
      shape: { 'named by the storage': 1, 'another name': 3 },
      extension: { jpg: 1, png: 2, none: 1 },
      owner: { 'with an owner': 1, 'with no owner': 3 },
      age: {
        'under 7 days': 1,
        'under 30 days': 1,
        'under 90 days': 1,
        '90 days or more': 1,
      },
      size: {
        'under 10 KB': 1,
        'under 100 KB': 1,
        'under 1 MB': 1,
        '1 MB or more': 1,
      },
    });
  });

  it('prints each group on a line, the largest count first, never a name', () => {
    const lines = breakdownLines(
      breakdownUnusedFiles(
        [
          file('/uploads/a-secret-name.png', 1, 1),
          file('/uploads/b.png', 1, 1),
          file(OWN, 1, 1),
        ],
        new Set(),
        NOW,
      ),
    );

    expect(lines).toEqual([
      '    by name: another name 2, named by the storage 1',
      '    by kind: png 2, jpg 1',
      '    by owner: with no owner 3',
      '    by age: under 7 days 3',
      '    by size: under 10 KB 3',
    ]);
    expect(lines.join('\n')).not.toContain('secret');
  });

  it('has nothing to say of no files', () => {
    expect(breakdownLines(breakdownUnusedFiles([], new Set(), NOW))).toEqual([
      '    by name: ',
      '    by kind: ',
      '    by owner: ',
      '    by age: ',
      '    by size: ',
    ]);
  });
});
