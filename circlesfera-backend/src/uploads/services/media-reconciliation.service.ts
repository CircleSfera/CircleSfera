import * as path from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../interfaces/storage-provider.interface.js';
import { UploadsService } from '../uploads.service.js';
import { MediaReferencesService } from './media-references.service.js';
import {
  ORPHAN_DELETIONS_PER_NIGHT,
  ORPHAN_GRACE_HOURS,
  ORPHAN_MAX_SHARE,
  ORPHAN_SHARE_WINDOW_DAYS,
} from './orphan-sweep.policy.js';
import {
  DELETED_CONTENT_KEPT_DAYS,
  StoredFilesService,
} from './stored-files.service.js';

export interface OrphanDetectionOptions {
  olderThanHours?: number;
  dryRun?: boolean;
  /** The most files deleted in one run, the oldest first. */
  maxDeletions?: number;
}

export interface OrphanMediaItem {
  url: string;
  lastModified: Date;
  ageHours: number;
  sizeBytes?: number;
}

export interface OrphanReconciliationResult {
  scannedCount: number;
  /** Listed files this storage does not delete (another shape, a subfolder). */
  foreignCount: number;
  referencedCount: number;
  orphanCount: number;
  orphans: OrphanMediaItem[];
  reconciled: boolean;
  /** The files sent for deletion: none in a dry run or when held back. */
  deletedCount: number;
  deletedBytes: number;
  /** Why nothing was deleted although files are unused, if it was held back. */
  heldBack?: string;
}

@Injectable()
export class MediaReconciliationService {
  private readonly logger = new Logger(MediaReconciliationService.name);

  constructor(
    private readonly mediaReferences: MediaReferencesService,
    private readonly uploadsService: UploadsService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
    private readonly storedFilesRecord: StoredFilesService,
  ) {}

  /**
   * Every address and file name that some row names (MEDIA_COLUMNS).
   */
  async getReferencedMediaKeys(): Promise<Set<string>> {
    return this.mediaReferences.referencedKeys();
  }

  /**
   * Detects orphaned media files in the storage provider that have no DB references
   * and exceed the grace period (ORPHAN_GRACE_HOURS) to avoid purging uploads in
   * progress. A file whose age the storage cannot tell is kept.
   */
  async detectAndReconcileOrphans(
    options?: OrphanDetectionOptions,
  ): Promise<OrphanReconciliationResult> {
    const olderThanHours = options?.olderThanHours ?? ORPHAN_GRACE_HOURS;
    const dryRun = options?.dryRun ?? false;
    const maxDeletions = options?.maxDeletions ?? ORPHAN_DELETIONS_PER_NIGHT;

    if (!this.storageProvider.listFiles) {
      this.logger.warn(
        'Current StorageProvider does not implement listFiles(); skipping orphan detection.',
      );
      return {
        scannedCount: 0,
        foreignCount: 0,
        referencedCount: 0,
        orphanCount: 0,
        orphans: [],
        reconciled: false,
        deletedCount: 0,
        deletedBytes: 0,
      };
    }

    const [storedFiles, referencedKeys] = await Promise.all([
      this.storageProvider.listFiles(),
      this.getReferencedMediaKeys(),
    ]);
    // A file on the disk the record does not know (stored before it, or by
    // a server that did not write it) is recorded with no owner: it is never
    // deleted by a person's action, only by this sweep when no row uses it.
    // Only files past the grace period: a file still being written by an
    // upload is recorded by that upload with its owner.
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    await this.storedFilesRecord.record(
      storedFiles
        .filter((file) => file.lastModified && file.lastModified <= cutoffTime)
        .map((file) => file.url),
      { profileId: null },
    );

    // The files of content deleted less than 30 days ago are kept:
    // not orphans until their time comes.
    const kept = await this.storedFilesRecord.detachedSince(
      new Date(Date.now() - DELETED_CONTENT_KEPT_DAYS * 24 * 60 * 60 * 1000),
    );
    const orphans: OrphanMediaItem[] = [];
    let foreignCount = 0;

    for (const file of storedFiles) {
      const url = file.url;
      const base = path.basename(url);

      // Only a file this storage deletes is weighed: a video's stream in its
      // subfolder, or a file of another shape, is never an orphan here.
      if (!this.uploadsService.ownsUrl(url)) {
        foreignCount++;
        continue;
      }

      const isReferenced = referencedKeys.has(url) || referencedKeys.has(base);
      if (isReferenced || kept.has(url)) {
        continue;
      }

      // A recent file may be an upload in progress; one of unknown age too.
      if (!file.lastModified || file.lastModified > cutoffTime) {
        continue;
      }

      const ageHours = Math.round(
        (Date.now() - file.lastModified.getTime()) / (1000 * 60 * 60),
      );

      orphans.push({
        url: file.url,
        lastModified: file.lastModified,
        ageHours,
        sizeBytes: file.sizeBytes,
      });
    }

    this.logger.log(
      `Orphan scan complete. Scanned: ${storedFiles.length}, Referenced DB keys: ${referencedKeys.size}, Orphans: ${orphans.length} (grace: ${olderThanHours}h, dryRun: ${dryRun})`,
    );

    const result: OrphanReconciliationResult = {
      scannedCount: storedFiles.length,
      foreignCount,
      referencedCount: referencedKeys.size,
      orphanCount: orphans.length,
      orphans,
      reconciled: false,
      deletedCount: 0,
      deletedBytes: 0,
    };
    if (dryRun || orphans.length === 0) {
      return result;
    }

    // So many unused files among those stored lately means the references
    // were misread: nothing goes. Old leftovers are not counted.
    const windowStart =
      Date.now() - ORPHAN_SHARE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const recentFiles = storedFiles.filter(
      (file) =>
        this.uploadsService.ownsUrl(file.url) &&
        file.lastModified &&
        file.lastModified.getTime() >= windowStart,
    ).length;
    const recentOrphans = orphans.filter(
      (orphan) => orphan.lastModified.getTime() >= windowStart,
    ).length;
    if (
      referencedKeys.size === 0 ||
      recentOrphans > recentFiles * ORPHAN_MAX_SHARE
    ) {
      result.heldBack =
        referencedKeys.size === 0
          ? 'no row names any file'
          : `${recentOrphans} of the ${recentFiles} files of the last ${ORPHAN_SHARE_WINDOW_DAYS} days are unused, past the share of ${ORPHAN_MAX_SHARE}`;
      this.logger.error(
        `Orphan sweep held back, nothing deleted: ${result.heldBack}.`,
      );
      return result;
    }

    // The oldest first, and only so many in one run.
    const candidates = [...orphans]
      .sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime())
      .slice(0, Math.max(0, maxDeletions));
    // A row may have named one of them since the scan began: read again,
    // as a person's deletion does too, so that a row naming the video's
    // stream or cover in its folder keeps the video and its folder.
    const [stillReferenced, inUse] = await Promise.all([
      this.getReferencedMediaKeys(),
      this.mediaReferences.inUse(candidates.map((orphan) => orphan.url)),
    ]);
    const toDelete = candidates.filter(
      (orphan) =>
        !inUse.has(orphan.url) &&
        !stillReferenced.has(orphan.url) &&
        !stillReferenced.has(path.basename(orphan.url)),
    );
    if (toDelete.length === 0) {
      return result;
    }

    const owners = await this.storedFilesRecord.ownersOf(
      toDelete.map((orphan) => orphan.url),
    );
    for (const orphan of toDelete) {
      // Server log only: the file's name, never where it is kept.
      this.logger.log(
        `Orphan sweep deletes ${path.basename(orphan.url)} (owner: ${owners.get(orphan.url) ?? 'none'}, ${orphan.sizeBytes ?? 0} bytes, ${orphan.ageHours} h old)`,
      );
    }
    await this.uploadsService.scheduleMediaDeletion(
      toDelete.map((orphan) => orphan.url),
    );
    result.reconciled = true;
    result.deletedCount = toDelete.length;
    result.deletedBytes = toDelete.reduce(
      (sum, orphan) => sum + (orphan.sizeBytes ?? 0),
      0,
    );
    this.logger.log(
      `Scheduled durable cleanup for ${toDelete.length} of ${orphans.length} orphaned media files.`,
    );
    return result;
  }

  /**
   * Daily reconciliation scheduled cron running at 04:00 AM server time. It
   * deletes the files no row has used for ORPHAN_GRACE_HOURS, at most
   * ORPHAN_DELETIONS_PER_NIGHT, and keeps those of content deleted less than
   * DELETED_CONTENT_KEPT_DAYS ago.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleDailyReconciliation(): Promise<void> {
    this.logger.log('Starting scheduled daily media orphan reconciliation...');
    try {
      const result = await this.detectAndReconcileOrphans({ dryRun: false });
      this.logger.log(
        `Daily media reconciliation: ${result.orphanCount} of ${result.scannedCount} files are used by no row; ${result.deletedCount} deleted (${result.deletedBytes} bytes).`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Error during daily media orphan reconciliation: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
