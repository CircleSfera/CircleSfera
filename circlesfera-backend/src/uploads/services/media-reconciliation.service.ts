import * as path from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../interfaces/storage-provider.interface.js';
import { UploadsService } from '../uploads.service.js';

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
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  /**
   * Scans the database and collects all active media URLs and basenames across all models.
   */
  async getReferencedMediaKeys(): Promise<Set<string>> {
    const keys = new Set<string>();

    const addRef = (rawUrl?: string | null) => {
      if (!rawUrl || typeof rawUrl !== 'string') return;
      keys.add(rawUrl.trim());
      const base = path.basename(rawUrl.trim());
      if (base) {
        keys.add(base);
      }
    };

    // 1. Post Media
    const postMedias = await this.prisma.postMedia.findMany({
      select: { url: true, standardUrl: true, thumbnailUrl: true },
    });
    for (const pm of postMedias) {
      addRef(pm.url);
      addRef(pm.standardUrl);
      addRef(pm.thumbnailUrl);
    }

    // 2. Profiles (avatar, cover, and resized variants)
    const profiles = await this.prisma.profile.findMany({
      select: {
        avatar: true,
        standardUrl: true,
        thumbnailUrl: true,
        cover: true,
        coverStandardUrl: true,
        coverThumbnailUrl: true,
      },
    });
    for (const p of profiles) {
      addRef(p.avatar);
      addRef(p.standardUrl);
      addRef(p.thumbnailUrl);
      addRef(p.cover);
      addRef(p.coverStandardUrl);
      addRef(p.coverThumbnailUrl);
    }

    // 3. Stories
    const stories = await this.prisma.story.findMany({
      select: { url: true, standardUrl: true, thumbnailUrl: true },
    });
    for (const s of stories) {
      addRef(s.url);
      addRef(s.standardUrl);
      addRef(s.thumbnailUrl);
    }

    // 4. Messages (attachments)
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [{ attachmentUrl: { not: null } }, { thumbnailUrl: { not: null } }],
      },
      select: { attachmentUrl: true, thumbnailUrl: true },
    });
    for (const m of messages) {
      addRef(m.attachmentUrl);
      addRef(m.thumbnailUrl);
    }

    // 5. Audio tracks
    const audios = await this.prisma.audio.findMany({
      select: { url: true, thumbnailUrl: true },
    });
    for (const a of audios) {
      addRef(a.url);
      addRef(a.thumbnailUrl);
    }

    return keys;
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

    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const orphans: OrphanMediaItem[] = [];

    for (const file of storedFiles) {
      const url = file.url;
      const base = path.basename(url);

      const isReferenced = referencedKeys.has(url) || referencedKeys.has(base);
      if (isReferenced) {
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
   * Daily reconciliation scheduled cron running at 04:00 AM server time.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleDailyReconciliation(): Promise<void> {
    this.logger.log('Starting scheduled daily media orphan reconciliation...');
    try {
      const result = await this.detectAndReconcileOrphans({
        olderThanHours: 24,
        dryRun: false,
      });
      this.logger.log(
        `Daily media reconciliation finished: found ${result.orphanCount} orphans across ${result.scannedCount} files.`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Error during daily media orphan reconciliation: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
