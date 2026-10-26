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
  DELETED_CONTENT_KEPT_DAYS,
  StoredFilesService,
} from './stored-files.service.js';

export interface OrphanDetectionOptions {
  olderThanHours?: number;
  dryRun?: boolean;
}

export interface OrphanMediaItem {
  url: string;
  lastModified?: Date;
  ageHours?: number;
  sizeBytes?: number;
}

export interface OrphanReconciliationResult {
  scannedCount: number;
  referencedCount: number;
  orphanCount: number;
  orphans: OrphanMediaItem[];
  reconciled: boolean;
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
   * and exceed the grace period (default 24h) to avoid purging uploads in progress.
   */
  async detectAndReconcileOrphans(
    options?: OrphanDetectionOptions,
  ): Promise<OrphanReconciliationResult> {
    const olderThanHours = options?.olderThanHours ?? 24;
    const dryRun = options?.dryRun ?? false;

    if (!this.storageProvider.listFiles) {
      this.logger.warn(
        'Current StorageProvider does not implement listFiles(); skipping orphan detection.',
      );
      return {
        scannedCount: 0,
        referencedCount: 0,
        orphanCount: 0,
        orphans: [],
        reconciled: false,
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
    const graceCutoff = new Date(
      Date.now() - (options?.olderThanHours ?? 24) * 60 * 60 * 1000,
    );
    await this.storedFilesRecord.record(
      storedFiles
        .filter((file) => file.lastModified && file.lastModified <= graceCutoff)
        .map((file) => file.url),
      { profileId: null },
    );

    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    // The files of content deleted less than 30 days ago are kept (PD-040):
    // not orphans until their time comes.
    const kept = await this.storedFilesRecord.detachedSince(
      new Date(Date.now() - DELETED_CONTENT_KEPT_DAYS * 24 * 60 * 60 * 1000),
    );
    const orphans: OrphanMediaItem[] = [];

    for (const file of storedFiles) {
      const url = file.url;
      const base = path.basename(url);

      const isReferenced = referencedKeys.has(url) || referencedKeys.has(base);
      if (isReferenced || kept.has(url)) {
        continue;
      }

      // Check grace period age
      if (file.lastModified && file.lastModified > cutoffTime) {
        // File is recent; keep in grace window for in-flight creations
        continue;
      }

      const ageHours = file.lastModified
        ? Math.round(
            (Date.now() - file.lastModified.getTime()) / (1000 * 60 * 60),
          )
        : undefined;

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

    let reconciled = false;
    if (!dryRun && orphans.length > 0) {
      const urlsToDelete = orphans.map((o) => o.url);
      await this.uploadsService.scheduleMediaDeletion(urlsToDelete);
      reconciled = true;
      this.logger.log(
        `Scheduled durable cleanup for ${orphans.length} orphaned media files.`,
      );
    }

    return {
      scannedCount: storedFiles.length,
      referencedCount: referencedKeys.size,
      orphanCount: orphans.length,
      orphans,
      reconciled,
    };
  }

  /**
   * Daily reconciliation scheduled cron running at 04:00 AM server time. It
   * reports only: the owner enables deletion with these reports in hand.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleDailyReconciliation(): Promise<void> {
    this.logger.log('Starting scheduled daily media orphan reconciliation...');
    try {
      const result = await this.detectAndReconcileOrphans({
        olderThanHours: 24,
        dryRun: true,
      });
      const bytes = result.orphans.reduce(
        (sum, orphan) => sum + (orphan.sizeBytes ?? 0),
        0,
      );
      this.logger.log(
        `Daily media reconciliation (report only): ${result.orphanCount} of ${result.scannedCount} files are used by no row, ${bytes} bytes; nothing deleted.`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Error during daily media orphan reconciliation: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
