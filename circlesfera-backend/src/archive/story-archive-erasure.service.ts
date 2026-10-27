import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import {
  type ErasedStory,
  eraseStory,
} from '../maintenance/content-erasure.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ERASE_TRANSACTION } from '../recently-deleted/recently-deleted.service.js';
import { UploadsService } from '../uploads/uploads.service.js';

// Stories read and erased at a time, and the most batches a night goes
// through: what is left waits for the next night.
export const STORY_ARCHIVE_BATCH_SIZE = 100;
export const STORY_ARCHIVE_MAX_BATCHES = 50;

/**
 * Each night, the stories that ended while their Profile had "Save stories to
 * archive" off are erased, as their author's own deletion for good would:
 * their files first (only the author's own, and only those no other row
 * names), then the rows. Turning the setting off keeps what is already in
 * the archive: only a story whose 24 hours end after it was turned off is
 * erased. A story in a highlight is always kept, and so is one in Recently
 * deleted (its own 30 days decide) or removed by moderation (kept for its
 * appeal).
 *
 * Each erasure holds the story (`FOR UPDATE`) and its Profile (`FOR SHARE`)
 * from the check to the deletion: a setting turned back on, a story added to
 * a highlight or a deletion made meanwhile is seen, and a second server
 * waits and then finds the row gone. A file that cannot be deleted keeps the
 * story, in the archive, for the next night. Running again erases nothing
 * new, and the job never throws.
 */
@Injectable()
export class StoryArchiveErasureService {
  private readonly logger = new Logger(StoryArchiveErasureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async eraseUnkept(now: Date = new Date()): Promise<void> {
    try {
      const count = await this.eraseAll(now);
      if (count > 0) {
        this.logger.log(
          `Erased ${count} ended stories not kept in their archive.`,
        );
      }
    } catch (error) {
      this.logger.error('Error erasing ended stories not kept', error);
    }
  }

  private async eraseAll(now: Date): Promise<number> {
    let after = '';
    let erased = 0;
    for (let batch = 0; batch < STORY_ARCHIVE_MAX_BATCHES; batch++) {
      const rows = await this.prisma.$queryRaw<ErasedStory[]>`
        SELECT s.id, s."profileId", s.url, s."standardUrl",
               s."thumbnailUrl", s."overlayUrl"
        FROM "stories" s
        JOIN "profiles" p ON p.id = s."profileId"
        WHERE p."saveStoriesToArchive" = false
          AND s."expiresAt" < ${now}
          AND s."expiresAt" > p."storyArchiveOffAt"
          AND s."deletedAt" IS NULL
          AND s."moderationStatus" <> 'REMOVED'
          AND NOT EXISTS (
            SELECT 1 FROM "highlight_stories" h WHERE h."storyId" = s.id
          )
          AND s.id > ${after}
        ORDER BY s.id
        LIMIT ${STORY_ARCHIVE_BATCH_SIZE}`;
      for (const story of rows) {
        try {
          const done = await this.prisma.$transaction(
            (tx) => this.eraseOne(tx, story, now),
            ERASE_TRANSACTION,
          );
          if (done) erased++;
        } catch (error) {
          this.logger.warn(
            `Ended story ${story.id} kept for the next night: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      if (rows.length < STORY_ARCHIVE_BATCH_SIZE) break;
      after = rows[rows.length - 1].id;
    }
    return erased;
  }

  // Checks again, on the rows it holds, that the story is still not kept,
  // then erases it. The highlight is looked up once the story is held, in a
  // statement of its own: one added just before is seen.
  private async eraseOne(
    tx: Prisma.TransactionClient,
    story: ErasedStory,
    now: Date,
  ): Promise<boolean> {
    const held = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT s.id
      FROM "stories" s
      JOIN "profiles" p ON p.id = s."profileId"
      WHERE s.id = ${story.id}
        AND p."saveStoriesToArchive" = false
        AND s."expiresAt" < ${now}
        AND s."expiresAt" > p."storyArchiveOffAt"
        AND s."deletedAt" IS NULL
        AND s."moderationStatus" <> 'REMOVED'
      FOR UPDATE OF s FOR SHARE OF p`;
    if (held.length === 0) return false;
    const inHighlight = await tx.highlightStory.count({
      where: { storyId: story.id },
    });
    if (inHighlight > 0) return false;
    await eraseStory(tx, this.uploads, story);
    return true;
  }
}
