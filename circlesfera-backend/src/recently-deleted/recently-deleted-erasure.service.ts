import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import {
  erasePost,
  eraseStory,
  STORY_FILES,
} from '../maintenance/content-erasure.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import {
  ERASE_TRANSACTION,
  recentlyDeletedCutoff,
} from './recently-deleted.service.js';

// Rows read and erased at a time, and the most batches of each kind a night
// goes through: what is left waits for the next night.
export const RECENTLY_DELETED_BATCH_SIZE = 100;
export const RECENTLY_DELETED_MAX_BATCHES = 50;

type Tx = Prisma.TransactionClient;
interface Deleted {
  id: string;
  profileId: string;
  deletedAt: Date | null;
}
interface Held {
  deletedAt: Date | null;
  moderationStatus: string;
}

/**
 * Each night, the posts (frames included) and stories their authors deleted
 * more than 30 days ago are erased, as "delete for good" does: their files
 * first, then the rows. What moderation removed meanwhile is left to the
 * erasure of removed content, which keeps it for its appeal.
 *
 * Each erasure holds its row (`FOR UPDATE`, the lock a restore takes too)
 * from the check to the deletion, so a restore just made is always seen, and
 * a second server waits and then finds the row gone. A file that cannot be
 * deleted keeps the row, still deleted and unseen, for the next night.
 * Running again erases nothing new, and the job never throws.
 */
@Injectable()
export class RecentlyDeletedErasureService {
  private readonly logger = new Logger(RecentlyDeletedErasureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async eraseExpired(now: Date = new Date()): Promise<void> {
    const kinds: Array<[string, () => Promise<number>]> = [
      ['posts', () => this.erasePosts(now)],
      ['stories', () => this.eraseStories(now)],
    ];
    // Each kind runs on its own, so one failure does not stop the other.
    for (const [label, erase] of kinds) {
      try {
        const count = await erase();
        if (count > 0) {
          this.logger.log(
            `Erased ${count} deleted ${label} whose 30 days were over.`,
          );
        }
      } catch (error) {
        this.logger.error(`Error erasing deleted ${label}`, error);
      }
    }
  }

  // The row held is still the one read: deleted, at the same time, and not
  // removed by moderation since.
  private static stillDeleted(held: Held[], row: Deleted): boolean {
    return (
      !!held[0]?.deletedAt &&
      held[0].deletedAt.getTime() === row.deletedAt?.getTime() &&
      held[0].moderationStatus !== 'REMOVED'
    );
  }

  // Goes through the expired rows of one kind a batch at a time, in order of
  // id, and answers how many were erased. A row that fails is kept for the
  // next night and the others go on.
  private async each<T extends Deleted>(
    label: string,
    now: Date,
    read: (where: {
      deletedAt: { lt: Date };
      moderationStatus: { not: 'REMOVED' };
      id?: { gt: string };
    }) => Promise<T[]>,
    erase: (tx: Tx, row: T) => Promise<boolean>,
  ): Promise<number> {
    const cutoff = recentlyDeletedCutoff(now);
    let after: string | undefined;
    let erased = 0;
    for (let batch = 0; batch < RECENTLY_DELETED_MAX_BATCHES; batch++) {
      const rows = await read({
        deletedAt: { lt: cutoff },
        moderationStatus: { not: 'REMOVED' },
        ...(after ? { id: { gt: after } } : {}),
      });
      for (const row of rows) {
        try {
          const done = await this.prisma.$transaction(
            (tx) => erase(tx, row),
            ERASE_TRANSACTION,
          );
          if (done) erased++;
        } catch (error) {
          this.logger.warn(
            `Deleted ${label} ${row.id} kept for the next night: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      if (rows.length < RECENTLY_DELETED_BATCH_SIZE) break;
      after = rows[rows.length - 1].id;
    }
    return erased;
  }

  private erasePosts(now: Date): Promise<number> {
    return this.each(
      'post',
      now,
      (where) =>
        this.prisma.post.findMany({
          where,
          orderBy: { id: 'asc' },
          take: RECENTLY_DELETED_BATCH_SIZE,
          select: { id: true, profileId: true, deletedAt: true },
        }),
      async (tx, post) => {
        const held = await tx.$queryRaw<Held[]>`
          SELECT "deletedAt", "moderationStatus" FROM posts
          WHERE id = ${post.id} FOR UPDATE`;
        if (!RecentlyDeletedErasureService.stillDeleted(held, post)) {
          return false;
        }
        await erasePost(tx, this.uploads, post);
        return true;
      },
    );
  }

  private eraseStories(now: Date): Promise<number> {
    return this.each(
      'story',
      now,
      (where) =>
        this.prisma.story.findMany({
          where,
          orderBy: { id: 'asc' },
          take: RECENTLY_DELETED_BATCH_SIZE,
          select: {
            id: true,
            profileId: true,
            deletedAt: true,
            ...STORY_FILES,
          },
        }),
      async (tx, story) => {
        const held = await tx.$queryRaw<Held[]>`
          SELECT "deletedAt", "moderationStatus" FROM stories
          WHERE id = ${story.id} FOR UPDATE`;
        if (!RecentlyDeletedErasureService.stillDeleted(held, story)) {
          return false;
        }
        await eraseStory(tx, this.uploads, story);
        return true;
      },
    );
  }
}
