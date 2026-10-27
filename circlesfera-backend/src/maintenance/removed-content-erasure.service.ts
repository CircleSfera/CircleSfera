import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import {
  APPEAL_WINDOW_MONTHS,
  appealDeadline,
} from '../appeals/appeal-window.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { IgnoredRows } from '../uploads/services/media-references.service.js';
import { UploadsService } from '../uploads/uploads.service.js';

// Rows read and erased at a time, and the most batches of each kind a night
// goes through: what is left waits for the next night.
export const ERASURE_BATCH_SIZE = 100;
export const ERASURE_MAX_BATCHES = 50;
// How long one erasure may hold its row while its files are deleted.
export const ERASURE_TRANSACTION_TIMEOUT_MS = 60_000;

type Files = Array<string | null | undefined>;
type Tx = Prisma.TransactionClient;
interface Removed {
  id: string;
  profileId: string;
  moderatedAt: Date | null;
}
type Expired = Removed & { moderatedAt: Date };
interface Held {
  moderationStatus: string;
  moderatedAt: Date | null;
}

/**
 * Content removed by moderation is kept, shown to nobody, for the six months
 * its author has to appeal. Each night, the posts (frames included), stories
 * and comments whose time to appeal is over, and that have no appeal still
 * open, are erased: their files first, then the rows, with no further wait.
 * A post goes with its comments and their files; a comment with its replies.
 *
 * Each erasure holds its row (`FOR UPDATE`, the lock an appeal takes too)
 * from the check to the deletion, so a just-filed appeal is always seen, and
 * a second server waits and then finds the row gone. A file that cannot be
 * deleted keeps the row, removed and unseen, for the next night: no file is
 * ever left with no row to say whose it is. Running again erases nothing new.
 */
@Injectable()
export class RemovedContentErasureService {
  private readonly logger = new Logger(RemovedContentErasureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async eraseExpired(now: Date = new Date()): Promise<void> {
    const kinds: Array<[string, () => Promise<number>]> = [
      ['posts', () => this.erasePosts(now)],
      ['stories', () => this.eraseStories(now)],
      ['comments', () => this.eraseComments(now)],
    ];
    // Each kind runs on its own, so one failure does not stop the others.
    for (const [label, erase] of kinds) {
      try {
        const count = await erase();
        if (count > 0) {
          this.logger.log(
            `Erased ${count} removed ${label} whose time to appeal was over.`,
          );
        }
      } catch (error) {
        this.logger.error(`Error erasing removed ${label}`, error);
      }
    }
  }

  // Read with a margin: a removal the query lets through whose deadline has
  // not passed yet is skipped, row by row, with the deadline appeals use.
  private static cutoff(now: Date): Date {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - APPEAL_WINDOW_MONTHS);
    return cutoff;
  }

  private static expired(row: Removed, now: Date): row is Expired {
    return !!row.moderatedAt && appealDeadline(row.moderatedAt) < now;
  }

  // The row held is still the one read: removed, at the same time.
  private static stillRemoved(held: Held[], row: Expired): boolean {
    return (
      held[0]?.moderationStatus === 'REMOVED' &&
      held[0].moderatedAt?.getTime() === row.moderatedAt.getTime()
    );
  }

  // Goes through the removed rows of one kind a batch at a time, in order of
  // id, and answers how many were erased. A row that fails is kept for the
  // next night and the others go on.
  private async each<T extends Removed>(
    label: string,
    now: Date,
    read: (where: {
      moderationStatus: 'REMOVED';
      moderatedAt: { lt: Date };
      id?: { gt: string };
    }) => Promise<T[]>,
    erase: (tx: Tx, row: T & Expired) => Promise<boolean>,
  ): Promise<number> {
    const cutoff = RemovedContentErasureService.cutoff(now);
    let after: string | undefined;
    let erased = 0;
    for (let batch = 0; batch < ERASURE_MAX_BATCHES; batch++) {
      const rows = await read({
        moderationStatus: 'REMOVED',
        moderatedAt: { lt: cutoff },
        ...(after ? { id: { gt: after } } : {}),
      });
      for (const row of rows) {
        if (!RemovedContentErasureService.expired(row, now)) continue;
        try {
          const done = await this.prisma.$transaction((tx) => erase(tx, row), {
            timeout: ERASURE_TRANSACTION_TIMEOUT_MS,
          });
          if (done) erased++;
        } catch (error) {
          this.logger.warn(
            `Removed ${label} ${row.id} kept for the next night: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      if (rows.length < ERASURE_BATCH_SIZE) break;
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
          take: ERASURE_BATCH_SIZE,
          select: { id: true, profileId: true, moderatedAt: true },
        }),
      async (tx, post) => {
        const held = await tx.$queryRaw<Held[]>`
          SELECT "moderationStatus", "moderatedAt" FROM posts
          WHERE id = ${post.id} FOR UPDATE`;
        if (!RemovedContentErasureService.stillRemoved(held, post)) {
          return false;
        }
        // An appeal still open keeps the post until it is decided.
        const open = await tx.appeal.findFirst({
          where: {
            targetType: 'POST_REMOVAL',
            targetId: post.id,
            status: 'PENDING',
          },
          select: { id: true },
        });
        if (open) return false;
        const media = await tx.postMedia.findMany({
          where: { postId: post.id },
          select: {
            id: true,
            url: true,
            standardUrl: true,
            thumbnailUrl: true,
          },
        });
        const comments = await tx.comment.findMany({
          where: { postId: post.id },
          select: { id: true, ...COMMENT_FILES },
        });
        await this.deleteFiles(
          [
            {
              profileId: post.profileId,
              files: media.flatMap((m) => [
                m.url,
                m.standardUrl,
                m.thumbnailUrl,
              ]),
            },
            ...comments.map(commentFiles),
          ],
          {
            postMedia: media.map((m) => m.id),
            comment: comments.map((c) => c.id),
          },
        );
        await tx.post.delete({ where: { id: post.id } });
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
          take: ERASURE_BATCH_SIZE,
          select: {
            id: true,
            profileId: true,
            moderatedAt: true,
            url: true,
            standardUrl: true,
            thumbnailUrl: true,
            overlayUrl: true,
          },
        }),
      async (tx, story) => {
        // A story cannot be appealed: nothing else keeps it.
        const held = await tx.$queryRaw<Held[]>`
          SELECT "moderationStatus", "moderatedAt" FROM stories
          WHERE id = ${story.id} FOR UPDATE`;
        if (!RemovedContentErasureService.stillRemoved(held, story)) {
          return false;
        }
        await this.deleteFiles(
          [
            {
              profileId: story.profileId,
              files: [
                story.url,
                story.standardUrl,
                story.thumbnailUrl,
                story.overlayUrl,
              ],
            },
          ],
          { story: [story.id] },
        );
        await tx.story.delete({ where: { id: story.id } });
        return true;
      },
    );
  }

  private eraseComments(now: Date): Promise<number> {
    return this.each(
      'comment',
      now,
      (where) =>
        this.prisma.comment.findMany({
          where,
          orderBy: { id: 'asc' },
          take: ERASURE_BATCH_SIZE,
          select: { id: true, moderatedAt: true, ...COMMENT_FILES },
        }),
      async (tx, comment) => {
        // A comment cannot be appealed: nothing else keeps it. Its replies
        // go with it, as the database deletes them.
        const held = await tx.$queryRaw<Held[]>`
          SELECT "moderationStatus", "moderatedAt" FROM comments
          WHERE id = ${comment.id} FOR UPDATE`;
        if (!RemovedContentErasureService.stillRemoved(held, comment)) {
          return false;
        }
        const replies = await this.repliesOf(tx, comment.id);
        const erased = [comment, ...replies];
        await this.deleteFiles(erased.map(commentFiles), {
          comment: erased.map((c) => c.id),
        });
        await tx.comment.delete({ where: { id: comment.id } });
        return true;
      },
    );
  }

  // Every reply under a comment, however deep.
  private async repliesOf(tx: Tx, commentId: string) {
    const replies: Array<{ id: string } & CommentFileColumns> = [];
    let parents = [commentId];
    while (parents.length > 0) {
      const found = await tx.comment.findMany({
        where: { parentId: { in: parents } },
        select: { id: true, ...COMMENT_FILES },
      });
      replies.push(...found);
      parents = found.map((reply) => reply.id);
    }
    return replies;
  }

  // The files of the rows about to be erased, each as its author's: only the
  // author's own, and only those no other row names, are deleted. A failure
  // is thrown, so the rows are kept and tried again the next night.
  private async deleteFiles(
    groups: Array<{ profileId: string; files: Files }>,
    ignoring: IgnoredRows,
  ): Promise<void> {
    for (const { profileId, files } of groups) {
      if (!files.some(Boolean)) continue;
      await this.uploads.deleteFilesOfErasedContent(profileId, files, ignoring);
    }
  }
}

const COMMENT_FILES = {
  profileId: true,
  url: true,
  standardUrl: true,
  thumbnailUrl: true,
  voiceUrl: true,
} as const;

interface CommentFileColumns {
  profileId: string;
  url: string | null;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  voiceUrl: string | null;
}

function commentFiles(comment: CommentFileColumns): {
  profileId: string;
  files: Files;
} {
  return {
    profileId: comment.profileId,
    files: [
      comment.url,
      comment.standardUrl,
      comment.thumbnailUrl,
      comment.voiceUrl,
    ],
  };
}
