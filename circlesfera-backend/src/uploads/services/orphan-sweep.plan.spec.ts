import { describe, expect, it } from 'vitest';
import { planOrphanSweep } from './orphan-sweep.plan.js';

const NOW = Date.UTC(2026, 10, 25);
const DAY_MS = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW - days * DAY_MS);
const owns = (url: string) => url.startsWith('/uploads/own-');

describe('planOrphanSweep', () => {
  it('weighs only the storage own files, and keeps used, kept, recent and undated ones', () => {
    const plan = planOrphanSweep({
      files: [
        { url: '/uploads/stream/master.m3u8', lastModified: at(30) },
        { url: '/uploads/own-used.jpg', lastModified: at(30) },
        { url: '/uploads/own-kept.jpg', lastModified: at(30) },
        { url: '/uploads/own-recent.jpg', lastModified: at(1) },
        { url: '/uploads/own-undated.jpg' },
        { url: '/uploads/own-b.jpg', lastModified: at(20), sizeBytes: 2 },
        { url: '/uploads/own-a.jpg', lastModified: at(40), sizeBytes: 1 },
        { url: '/uploads/own-u2.jpg', lastModified: at(2) },
        { url: '/uploads/own-u3.jpg', lastModified: at(2) },
      ],
      referenced: new Set([
        '/uploads/own-used.jpg',
        'own-u2.jpg',
        '/uploads/own-u3.jpg',
      ]),
      kept: new Set(['/uploads/own-kept.jpg']),
      owns,
      now: NOW,
      maxDeletions: 1,
    });

    expect(plan).toMatchObject({
      scanned: 9,
      foreign: 1,
      used: 3,
      keptDeleted: 1,
      unusedRecent: 2,
    });
    expect(plan.orphans.map((orphan) => orphan.url)).toEqual([
      '/uploads/own-b.jpg',
      '/uploads/own-a.jpg',
    ]);
    expect(plan.orphans[0].ageHours).toBe(20 * 24);
    expect(plan.heldBack).toBeUndefined();
    // The oldest first, at most maxDeletions.
    expect(plan.toDelete.map((orphan) => orphan.url)).toEqual([
      '/uploads/own-a.jpg',
    ]);
  });

  it('holds back when no row names any file', () => {
    const plan = planOrphanSweep({
      files: [{ url: '/uploads/own-a.jpg', lastModified: at(30) }],
      referenced: new Set(),
      kept: new Set(),
      owns,
      now: NOW,
    });

    expect(plan.heldBack).toBe('no row names any file');
    expect(plan.hold).toEqual({
      reason: 'no_references',
      recentOrphans: 1,
      recentFiles: 1,
    });
    expect(plan.toDelete).toEqual([]);
  });

  it('holds back past the share of unused recent files, old leftovers left out', () => {
    const plan = planOrphanSweep({
      files: [
        { url: '/uploads/own-a.jpg', lastModified: at(30) },
        { url: '/uploads/own-b.jpg', lastModified: at(30) },
        { url: '/uploads/own-c.jpg', lastModified: at(30) },
        { url: '/uploads/own-old.jpg', lastModified: at(400) },
      ],
      referenced: new Set(['/uploads/own-a.jpg']),
      kept: new Set(),
      owns,
      now: NOW,
    });

    expect(plan.hold).toEqual({
      reason: 'share_exceeded',
      recentOrphans: 2,
      recentFiles: 3,
    });
    expect(plan.heldBack).toBe(
      '2 of the 3 files of the last 90 days are unused, past the share of 0.5',
    );
    expect(plan.toDelete).toEqual([]);
  });

  it('has nothing to decide without unused files', () => {
    const plan = planOrphanSweep({
      files: [],
      referenced: new Set(),
      kept: new Set(),
      owns,
    });
    expect(plan.orphans).toEqual([]);
    expect(plan.hold).toBeUndefined();
  });
});
