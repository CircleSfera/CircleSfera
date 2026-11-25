import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaReferencesService } from '../uploads/services/media-references.service.js';
import { planOrphanSweep } from '../uploads/services/orphan-sweep.plan.js';
import {
  ORPHAN_DELETIONS_PER_NIGHT,
  ORPHAN_GRACE_HOURS,
  ORPHAN_MAX_SHARE,
  ORPHAN_SHARE_WINDOW_DAYS,
} from '../uploads/services/orphan-sweep.policy.js';
import {
  DELETED_CONTENT_KEPT_DAYS,
  StoredFilesService,
} from '../uploads/services/stored-files.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import {
  breakdownUnusedFiles,
  type UnusedFilesBreakdown,
} from './orphan-files-breakdown.js';
import {
  type FileOnDisk,
  listStoredFilesOnDisk,
} from './stored-files-on-disk.js';

/** How long a computed report is served before it is computed again. */
export const ORPHAN_REPORT_CACHE_MS = 10 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrphanFilesReport {
  generatedAt: string;
  // 'no_local_storage' when the server keeps no files on its own disk.
  status: 'ok' | 'no_local_storage';
  policy: {
    graceHours: number;
    deletionsPerNight: number;
    deletedContentKeptDays: number;
    maxShare: number;
    shareWindowDays: number;
  };
  files: { count: number; bytes: number };
  // Files of another shape or in a subfolder: the sweep never weighs them.
  foreign: number;
  used: number;
  keptDeleted: number;
  unusedRecent: number;
  // Unused for longer than the grace period.
  orphans: { count: number; bytes: number; nights: number };
  // What the next run would delete: none when it is held back.
  nextRun: { count: number; bytes: number };
  // The sweep's safety stop: when set, it deletes nothing.
  heldBack: {
    reason: 'no_references' | 'share_exceeded';
    recentOrphans: number;
    recentFiles: number;
  } | null;
  breakdown: UnusedFilesBreakdown;
  record: {
    rows: number;
    withOwner: number;
    withoutOwner: number;
    missingOnDisk: number;
  };
  unrecordedOnDisk: number;
}

/**
 * How many stored files the nightly orphan sweep would delete, and of what
 * kind, so the owner can decide with numbers. It decides with the sweep's
 * own rules (planOrphanSweep), its safety stop included. Read-only: it lists
 * the files on the disk and reads the database; it records and deletes
 * nothing. Counts and sizes only: never a file name or an address.
 *
 * Reading every stored file and every row that names one is heavy: the last
 * report is kept for ORPHAN_REPORT_CACHE_MS, and requests that arrive while
 * one is computed share it.
 */
@Injectable()
export class OrphanFilesReportService {
  private cached: { at: number; report: OrphanFilesReport } | null = null;
  private running: Promise<OrphanFilesReport> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MediaReferencesService)
    private readonly references: MediaReferencesService,
    @Inject(StoredFilesService)
    private readonly storedFiles: StoredFilesService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  async report(now = Date.now()): Promise<OrphanFilesReport> {
    if (this.cached && now - this.cached.at < ORPHAN_REPORT_CACHE_MS) {
      return this.cached.report;
    }
    if (!this.running) {
      this.running = this.compute(now)
        .then((report) => {
          this.cached = { at: now, report };
          return report;
        })
        .finally(() => {
          this.running = null;
        });
    }
    return this.running;
  }

  private async compute(now: number): Promise<OrphanFilesReport> {
    let files: FileOnDisk[];
    try {
      // Read only, and strict: a folder it cannot read is an error, so a
      // partial listing is never reported as the whole.
      files = await listStoredFilesOnDisk(path.join(process.cwd(), 'uploads'));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
      return this.empty(now);
    }
    const [referenced, kept, records] = await Promise.all([
      this.references.referencedKeys(),
      this.storedFiles.detachedSince(
        new Date(now - DELETED_CONTENT_KEPT_DAYS * DAY_MS),
      ),
      this.prisma.storedFile.findMany({
        select: { key: true, profileId: true },
      }),
    ]);

    const plan = planOrphanSweep({
      files,
      referenced,
      kept,
      owns: (url) => this.uploads.ownsUrl(url),
      now,
    });
    const bytes = (items: { sizeBytes?: number }[]) =>
      items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);

    const owned = records.filter((record) => record.profileId);
    const owners = new Set(owned.map((record) => record.key));
    const recorded = new Set(records.map((record) => record.key));
    const onDisk = new Set(files.map((file) => file.url));
    const orphanUrls = new Set(plan.orphans.map((orphan) => orphan.url));
    const orphanFiles = files.filter((file) => orphanUrls.has(file.url));

    return {
      generatedAt: new Date(now).toISOString(),
      status: 'ok',
      policy: this.policy(),
      files: { count: files.length, bytes: bytes(files) },
      foreign: plan.foreign,
      used: plan.used,
      keptDeleted: plan.keptDeleted,
      unusedRecent: plan.unusedRecent,
      orphans: {
        count: plan.orphans.length,
        bytes: bytes(plan.orphans),
        nights: plan.hold
          ? 0
          : Math.ceil(plan.orphans.length / ORPHAN_DELETIONS_PER_NIGHT),
      },
      nextRun: { count: plan.toDelete.length, bytes: bytes(plan.toDelete) },
      heldBack: plan.hold ?? null,
      breakdown: breakdownUnusedFiles(orphanFiles, owners, now),
      record: {
        rows: records.length,
        withOwner: owned.length,
        withoutOwner: records.length - owned.length,
        missingOnDisk: records.filter((record) => !onDisk.has(record.key))
          .length,
      },
      unrecordedOnDisk: files.filter((file) => !recorded.has(file.url)).length,
    };
  }

  private policy(): OrphanFilesReport['policy'] {
    return {
      graceHours: ORPHAN_GRACE_HOURS,
      deletionsPerNight: ORPHAN_DELETIONS_PER_NIGHT,
      deletedContentKeptDays: DELETED_CONTENT_KEPT_DAYS,
      maxShare: ORPHAN_MAX_SHARE,
      shareWindowDays: ORPHAN_SHARE_WINDOW_DAYS,
    };
  }

  private empty(now: number): OrphanFilesReport {
    return {
      generatedAt: new Date(now).toISOString(),
      status: 'no_local_storage',
      policy: this.policy(),
      files: { count: 0, bytes: 0 },
      foreign: 0,
      used: 0,
      keptDeleted: 0,
      unusedRecent: 0,
      orphans: { count: 0, bytes: 0, nights: 0 },
      nextRun: { count: 0, bytes: 0 },
      heldBack: null,
      breakdown: breakdownUnusedFiles([], new Set(), now),
      record: { rows: 0, withOwner: 0, withoutOwner: 0, missingOnDisk: 0 },
      unrecordedOnDisk: 0,
    };
  }
}
