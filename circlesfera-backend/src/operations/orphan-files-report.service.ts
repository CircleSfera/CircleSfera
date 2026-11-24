import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaReferencesService } from '../uploads/services/media-references.service.js';
import {
  ORPHAN_DELETIONS_PER_NIGHT,
  ORPHAN_GRACE_HOURS,
} from '../uploads/services/orphan-sweep.policy.js';
import { DELETED_CONTENT_KEPT_DAYS } from '../uploads/services/stored-files.service.js';
import {
  breakdownUnusedFiles,
  type UnusedFilesBreakdown,
} from './orphan-files-breakdown.js';
import { listStoredFilesOnDisk } from './stored-files-on-disk.js';

export interface OrphanFilesReport {
  generatedAt: string;
  // 'no_local_storage' when the server keeps no files on its own disk.
  status: 'ok' | 'no_local_storage';
  policy: {
    graceHours: number;
    deletionsPerNight: number;
    deletedContentKeptDays: number;
  };
  files: { count: number; bytes: number };
  used: number;
  // What the nightly sweep would delete: unused for longer than the grace.
  sweepable: { count: number; bytes: number; nights: number };
  keptDeleted: number;
  unusedRecent: number;
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
 * kind, so the owner can decide with numbers before its deletion is turned
 * on. It counts with the sweep's own rules (orphan-sweep.policy.ts and the
 * rows MEDIA_COLUMNS names). Read-only: it lists the files on the disk and
 * reads the database; it writes, records and deletes nothing. Counts and
 * sizes only: never a file name or an address.
 */
@Injectable()
export class OrphanFilesReportService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MediaReferencesService)
    private readonly references: MediaReferencesService,
  ) {}

  async report(now = Date.now()): Promise<OrphanFilesReport> {
    const policy = {
      graceHours: ORPHAN_GRACE_HOURS,
      deletionsPerNight: ORPHAN_DELETIONS_PER_NIGHT,
      deletedContentKeptDays: DELETED_CONTENT_KEPT_DAYS,
    };
    let files: Awaited<ReturnType<typeof listStoredFilesOnDisk>>;
    try {
      // Read only, and strict: a folder it cannot read is an error, so a
      // partial listing is never reported as the whole.
      files = await listStoredFilesOnDisk(path.join(process.cwd(), 'uploads'));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
      return this.empty(now, policy);
    }
    const [referenced, records] = await Promise.all([
      this.references.referencedKeys(),
      this.prisma.storedFile.findMany({
        select: { key: true, profileId: true, detachedAt: true },
      }),
    ]);

    const cutoff = now - ORPHAN_GRACE_HOURS * 60 * 60 * 1000;
    // The files of content deleted less than this long ago are kept.
    const keptSince = now - DELETED_CONTENT_KEPT_DAYS * 24 * 60 * 60 * 1000;
    const kept = new Set(
      records
        .filter(
          (record) =>
            record.detachedAt && record.detachedAt.getTime() >= keptSince,
        )
        .map((record) => record.key),
    );
    const onDisk = new Set(files.map((file) => file.url));
    let used = 0;
    let keptDeleted = 0;
    let unusedRecent = 0;
    let totalBytes = 0;
    const sweepable: typeof files = [];
    let sweepableBytes = 0;
    for (const file of files) {
      totalBytes += file.sizeBytes;
      if (referenced.has(file.url) || referenced.has(path.basename(file.url))) {
        used++;
      } else if (kept.has(file.url)) {
        keptDeleted++;
      } else if (file.lastModified.getTime() > cutoff) {
        unusedRecent++;
      } else {
        sweepable.push(file);
        sweepableBytes += file.sizeBytes;
      }
    }
    const owned = records.filter((record) => record.profileId);
    const owners = new Set(owned.map((record) => record.key));
    const recorded = new Set(records.map((record) => record.key));

    return {
      generatedAt: new Date(now).toISOString(),
      status: 'ok',
      policy,
      files: { count: files.length, bytes: totalBytes },
      used,
      sweepable: {
        count: sweepable.length,
        bytes: sweepableBytes,
        nights: Math.ceil(sweepable.length / ORPHAN_DELETIONS_PER_NIGHT),
      },
      keptDeleted,
      unusedRecent,
      breakdown: breakdownUnusedFiles(sweepable, owners, now),
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

  private empty(
    now: number,
    policy: OrphanFilesReport['policy'],
  ): OrphanFilesReport {
    return {
      generatedAt: new Date(now).toISOString(),
      status: 'no_local_storage',
      policy,
      files: { count: 0, bytes: 0 },
      used: 0,
      sweepable: { count: 0, bytes: 0, nights: 0 },
      keptDeleted: 0,
      unusedRecent: 0,
      breakdown: breakdownUnusedFiles([], new Set(), now),
      record: { rows: 0, withOwner: 0, withoutOwner: 0, missingOnDisk: 0 },
      unrecordedOnDisk: 0,
    };
  }
}
