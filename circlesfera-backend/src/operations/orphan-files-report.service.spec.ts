import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ORPHAN_DELETIONS_PER_NIGHT,
  ORPHAN_GRACE_HOURS,
} from '../uploads/services/orphan-sweep.policy.js';
import { DELETED_CONTENT_KEPT_DAYS } from '../uploads/services/stored-files.service.js';
import { OrphanFilesReportService } from './orphan-files-report.service.js';

const NOW = Date.UTC(2026, 10, 25, 12);
const DAY_MS = 24 * 60 * 60 * 1000;
const OLD = new Date(NOW - 30 * DAY_MS);
const RECENT = new Date(NOW - 1 * DAY_MS);

let workdir: string;
let uploads: string;

function stored(name: string, bytes: number, modified: Date) {
  const file = path.join(uploads, name);
  fs.writeFileSync(file, Buffer.alloc(bytes));
  fs.utimesSync(file, modified, modified);
}

function setup(
  referenced: string[],
  records: { key: string; profileId: string | null; detachedAt: Date | null }[],
) {
  const prisma = {
    storedFile: { findMany: vi.fn().mockResolvedValue(records) },
  };
  const references = {
    referencedKeys: vi.fn().mockResolvedValue(new Set(referenced)),
  };
  return {
    prisma,
    references,
    service: new OrphanFilesReportService(prisma as never, references as never),
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
    const own = '0b9c1f8e-2d3a-4c5b-8e6f-7a8b9c0d1e2f.jpg';
    stored(own, 100, OLD); // used by a row, by its address
    stored('by-name.png', 50, OLD); // used by a row, by its name alone
    stored('deleted-lately.png', 30, OLD); // of content deleted lately: kept
    stored('fresh.png', 20, RECENT); // unused, within the grace: kept
    stored('orphan-a.png', 400, OLD); // unused, past the grace
    stored('secret-name.webp', 600, OLD); // unused, past the grace
    const { service, prisma } = setup(
      [`/uploads/${own}`, 'by-name.png'],
      [
        { key: `/uploads/${own}`, profileId: 'profile-1', detachedAt: null },
        {
          key: '/uploads/deleted-lately.png',
          profileId: 'profile-2',
          detachedAt: new Date(NOW - 2 * DAY_MS),
        },
        {
          key: '/uploads/orphan-a.png',
          profileId: null,
          // Deleted long ago: no longer kept.
          detachedAt: new Date(NOW - (DELETED_CONTENT_KEPT_DAYS + 5) * DAY_MS),
        },
        { key: '/uploads/gone.png', profileId: null, detachedAt: null },
      ],
    );

    const report = await service.report(NOW);

    expect(prisma.storedFile.findMany).toHaveBeenCalledWith({
      select: { key: true, profileId: true, detachedAt: true },
    });
    expect(report).toEqual({
      generatedAt: new Date(NOW).toISOString(),
      status: 'ok',
      policy: {
        graceHours: ORPHAN_GRACE_HOURS,
        deletionsPerNight: ORPHAN_DELETIONS_PER_NIGHT,
        deletedContentKeptDays: DELETED_CONTENT_KEPT_DAYS,
      },
      files: { count: 6, bytes: 1200 },
      used: 2,
      sweepable: { count: 2, bytes: 1000, nights: 1 },
      keptDeleted: 1,
      unusedRecent: 1,
      breakdown: {
        shape: { other_name: 2 },
        extension: { png: 1, webp: 1 },
        owner: { no_owner: 2 },
        age: { lt_90d: 2 },
        size: { lt_10kb: 2 },
      },
      record: { rows: 4, withOwner: 2, withoutOwner: 2, missingOnDisk: 1 },
      unrecordedOnDisk: 3,
    });
    expect(JSON.stringify(report)).not.toContain('secret');
    // Read only: the folder holds what it held.
    expect(fs.readdirSync(uploads)).toHaveLength(6);
  });

  it('says so when the server keeps no files on its own disk', async () => {
    fs.rmSync(uploads, { recursive: true });
    const { service, references } = setup([], []);

    const report = await service.report(NOW);

    expect(report.status).toBe('no_local_storage');
    expect(report.files).toEqual({ count: 0, bytes: 0 });
    expect(report.sweepable).toEqual({ count: 0, bytes: 0, nights: 0 });
    expect(references.referencedKeys).not.toHaveBeenCalled();
  });

  it('fails rather than count a folder it cannot read', async () => {
    vi.spyOn(fs.promises, 'readdir').mockRejectedValue(
      Object.assign(new Error('denied'), { code: 'EACCES' }),
    );
    const { service } = setup([], []);

    await expect(service.report(NOW)).rejects.toThrow('denied');
  });

  it('reads the clock when not given one', async () => {
    const { service } = setup([], []);

    const report = await service.report();

    expect(report.status).toBe('ok');
    expect(report.files.count).toBe(0);
  });
});
