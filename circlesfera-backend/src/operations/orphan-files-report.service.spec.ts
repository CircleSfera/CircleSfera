import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_UPLOAD_URL } from '../common/constants/local-upload.constants.js';
import { MediaReconciliationService } from '../uploads/services/media-reconciliation.service.js';
import {
  ORPHAN_DELETIONS_PER_NIGHT,
  ORPHAN_GRACE_HOURS,
  ORPHAN_MAX_SHARE,
  ORPHAN_SHARE_WINDOW_DAYS,
} from '../uploads/services/orphan-sweep.policy.js';
import { DELETED_CONTENT_KEPT_DAYS } from '../uploads/services/stored-files.service.js';
import {
  ORPHAN_REPORT_CACHE_MS,
  OrphanFilesReportService,
} from './orphan-files-report.service.js';
import { listStoredFilesOnDisk } from './stored-files-on-disk.js';

const NOW = Date.UTC(2026, 10, 25, 12);
const DAY_MS = 24 * 60 * 60 * 1000;
const OLD = new Date(NOW - 30 * DAY_MS);
const RECENT = new Date(NOW - 1 * DAY_MS);

/** A name the storage gives a file: <uuid>.<extension>. */
const own = (n: number, extension = 'jpg') =>
  `0b9c1f8e-2d3a-4c5b-8e6f-${String(n).padStart(12, '0')}.${extension}`;

let workdir: string;
let uploads: string;

function stored(name: string, bytes: number, modified: Date) {
  const file = path.join(uploads, name);
  fs.writeFileSync(file, Buffer.alloc(bytes));
  fs.utimesSync(file, modified, modified);
}

function setup(
  referenced: string[],
  records: { key: string; profileId: string | null }[],
  keptDeleted: string[] = [],
) {
  const prisma = {
    storedFile: { findMany: vi.fn().mockResolvedValue(records) },
  };
  const references = {
    referencedKeys: vi.fn().mockResolvedValue(new Set(referenced)),
  };
  const storedFiles = {
    detachedSince: vi.fn().mockResolvedValue(new Set(keptDeleted)),
  };
  const uploadsService = {
    ownsUrl: (url: string) => LOCAL_UPLOAD_URL.test(url),
  };
  return {
    prisma,
    references,
    storedFiles,
    uploadsService,
    service: new OrphanFilesReportService(
      prisma as never,
      references as never,
      storedFiles as never,
      uploadsService as never,
    ),
  };
}

describe('OrphanFilesReportService', () => {
  beforeEach(() => {
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-report-'));
    uploads = path.join(workdir, 'uploads');
    fs.mkdirSync(uploads);
    vi.spyOn(process, 'cwd').mockReturnValue(workdir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('counts what the sweep would delete with its own rules, in counts and sizes only', async () => {
    stored(own(1), 100, OLD); // used by a row, by its address
    stored(own(2), 50, OLD); // used by a row, by its name alone
    stored(own(3), 30, OLD); // of content deleted lately: kept
    stored(own(4), 20, RECENT); // unused, within the grace: kept
    stored(own(5), 400, OLD); // unused, past the grace
    stored(own(6, 'webp'), 600, OLD); // unused, past the grace
    stored(own(7), 10, RECENT); // used, recent
    stored('secret-name.png', 700, OLD); // not of the storage's shape
    const { service, prisma, storedFiles } = setup(
      [`/uploads/${own(1)}`, own(2), `/uploads/${own(7)}`],
      [
        { key: `/uploads/${own(1)}`, profileId: 'profile-1' },
        { key: `/uploads/${own(3)}`, profileId: 'profile-2' },
        { key: `/uploads/${own(5)}`, profileId: null },
        { key: '/uploads/gone.png', profileId: null },
      ],
      [`/uploads/${own(3)}`],
    );

    const report = await service.report(NOW);

    expect(prisma.storedFile.findMany).toHaveBeenCalledWith({
      select: { key: true, profileId: true },
    });
    expect(storedFiles.detachedSince).toHaveBeenCalledWith(
      new Date(NOW - DELETED_CONTENT_KEPT_DAYS * DAY_MS),
    );
    expect(report).toEqual({
      generatedAt: new Date(NOW).toISOString(),
      status: 'ok',
      policy: {
        graceHours: ORPHAN_GRACE_HOURS,
        deletionsPerNight: ORPHAN_DELETIONS_PER_NIGHT,
        deletedContentKeptDays: DELETED_CONTENT_KEPT_DAYS,
        maxShare: ORPHAN_MAX_SHARE,
        shareWindowDays: ORPHAN_SHARE_WINDOW_DAYS,
      },
      files: { count: 8, bytes: 1910 },
      foreign: 1,
      used: 3,
      keptDeleted: 1,
      unusedRecent: 1,
      orphans: { count: 2, bytes: 1000, nights: 1 },
      nextRun: { count: 2, bytes: 1000 },
      heldBack: null,
      breakdown: {
        shape: { storage_named: 2 },
        extension: { jpg: 1, webp: 1 },
        owner: { no_owner: 2 },
        age: { lt_90d: 2 },
        size: { lt_10kb: 2 },
      },
      record: { rows: 4, withOwner: 2, withoutOwner: 2, missingOnDisk: 1 },
      unrecordedOnDisk: 5,
    });
    expect(JSON.stringify(report)).not.toContain('secret');
    // Read only: the folder holds what it held.
    expect(fs.readdirSync(uploads)).toHaveLength(8);
  });

  it('says when the sweep would stop itself and delete nothing', async () => {
    // Three of the four recent files are unused: past the share of 0.5.
    stored(own(1), 10, OLD);
    stored(own(2), 10, OLD);
    stored(own(3), 10, OLD);
    stored(own(4), 10, OLD);
    const { service } = setup([`/uploads/${own(1)}`], []);

    const report = await service.report(NOW);

    expect(report.orphans.count).toBe(3);
    expect(report.nextRun).toEqual({ count: 0, bytes: 0 });
    expect(report.orphans.nights).toBe(0);
    expect(report.heldBack).toEqual({
      reason: 'share_exceeded',
      recentOrphans: 3,
      recentFiles: 4,
    });
  });

  it('decides exactly as the sweep does on the same files', async () => {
    for (let n = 1; n <= 8; n++) {
      stored(own(n), n * 10, new Date(NOW - (8 + n) * DAY_MS));
    }
    stored(own(9), 5, RECENT);
    stored('README', 5, OLD);
    const referenced = [`/uploads/${own(1)}`, own(2), `/uploads/${own(3)}`];
    const kept = [`/uploads/${own(4)}`];
    const { service, uploadsService } = setup(referenced, [], kept);

    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    try {
      const report = await service.report(NOW);
      const scheduleMediaDeletion = vi.fn();
      const sweep = new MediaReconciliationService(
        {
          referencedKeys: vi.fn().mockResolvedValue(new Set(referenced)),
          inUse: vi.fn().mockResolvedValue(new Set()),
        } as never,
        { ...uploadsService, scheduleMediaDeletion } as never,
        { listFiles: () => listStoredFilesOnDisk(uploads) } as never,
        {
          record: vi.fn(),
          detachedSince: vi.fn().mockResolvedValue(new Set(kept)),
          ownersOf: vi.fn().mockResolvedValue(new Map()),
        } as never,
      );
      const result = await sweep.detectAndReconcileOrphans({ dryRun: false });

      const swept: string[] = scheduleMediaDeletion.mock.calls[0][0];
      expect(report.nextRun.count).toBe(swept.length);
      expect(report.orphans.count).toBe(result.orphanCount);
      expect(report.foreign).toBe(result.foreignCount);
      expect(report.nextRun.bytes).toBe(result.deletedBytes);
      expect(swept.sort()).toEqual(
        [5, 6, 7, 8].map((n) => `/uploads/${own(n)}`),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the last report for a while, and runs once for requests that arrive together', async () => {
    stored(own(1), 10, OLD);
    const { service, references } = setup([`/uploads/${own(1)}`], []);

    const [first, second] = await Promise.all([
      service.report(NOW),
      service.report(NOW),
    ]);
    expect(second).toBe(first);
    expect(references.referencedKeys).toHaveBeenCalledTimes(1);

    await expect(
      service.report(NOW + ORPHAN_REPORT_CACHE_MS - 1),
    ).resolves.toBe(first);
    expect(references.referencedKeys).toHaveBeenCalledTimes(1);

    const later = await service.report(NOW + ORPHAN_REPORT_CACHE_MS);
    expect(later).not.toBe(first);
    expect(later.generatedAt).toBe(
      new Date(NOW + ORPHAN_REPORT_CACHE_MS).toISOString(),
    );
    expect(references.referencedKeys).toHaveBeenCalledTimes(2);
  });

  it('runs again after a failed run, rather than keeping the failure', async () => {
    const readdir = vi
      .spyOn(fs.promises, 'readdir')
      .mockRejectedValueOnce(
        Object.assign(new Error('denied'), { code: 'EACCES' }),
      );
    const { service } = setup([], []);

    await expect(service.report(NOW)).rejects.toThrow('denied');
    readdir.mockRestore();
    await expect(service.report(NOW)).resolves.toMatchObject({ status: 'ok' });
  });

  it('says so when the server keeps no files on its own disk', async () => {
    fs.rmSync(uploads, { recursive: true });
    const { service, references } = setup([], []);

    const report = await service.report(NOW);

    expect(report.status).toBe('no_local_storage');
    expect(report.files).toEqual({ count: 0, bytes: 0 });
    expect(report.orphans).toEqual({ count: 0, bytes: 0, nights: 0 });
    expect(report.heldBack).toBeNull();
    expect(references.referencedKeys).not.toHaveBeenCalled();
  });

  it('reads the clock when not given one', async () => {
    const { service } = setup([], []);

    const report = await service.report();

    expect(report.status).toBe('ok');
    expect(report.files.count).toBe(0);
  });
});
