import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  APPEAL_WINDOW_MONTHS,
  appealDeadline,
} from '../appeals/appeal-window.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';

// Rows read and erased at a time, and the most batches of each kind a night
// goes through: what is left waits for the next night.
export const ERASURE_BATCH_SIZE = 100;
export const ERASURE_MAX_BATCHES = 50;

type Files = Array<string | null | undefined>;
interface Removed {
  id: string;
  profileId: string;
  moderatedAt: Date | null;
}

/**
 * Content removed by moderation is kept, shown to nobody, for the six months
 * its author has to appeal. Each night, the posts (frames included), stories
 * and comments whose time to appeal is over, and that have no appeal still
 * open, are erased: the row and its files at once, with no further wait. A
 * post goes with its comments and their files; a comment with its replies.
 *
 * Safe to run on two servers at once: a row is deleted only while it is
 * still removed with the same removal time, and the files are deleted only
 * by the run whose deletion took the row. Running again erases nothing new.
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

  private static expired(
    row: Removed,
    now: Date,
  ): row is Removed & {
    moderatedAt: Date;
  } {
    return !!row.moderatedAt && appealDeadline(row.moderatedAt) < now;
  }

  // Goes through the removed rows of one kind a batch at a time, in order of
  // id, and answers how many were erased.
  private async each<T extends Removed>(
    now: Date,
    read: (where: {
      moderationStatus: 'REMOVED';
      moderatedAt: { lt: Date };
      id?: { gt: string };
    }) => Promise<T[]>,
    erase: (row: T & { moderatedAt: Date }) => Promise<boolean>,
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
        if (
          RemovedContentErasureService.expired(row, now) &&
          (await erase(row))
        ) {
          erased++;
        }
      }
      if (rows.length < ERASURE_BATCH_SIZE) break;
      after = rows[rows.length - 1].id;
    }
    return erased;
  }

  private erasePosts(now: Date): Promise<number> {
    return this.each(
      now,
      (where) =>
        this.prisma.post.findMany({
          where,
          orderBy: { id: 'asc' },
          take: ERASURE_BATCH_SIZE,
          select: { id: true, profileId: true, moderatedAt: true },
        }),
      (post) => this.erasePost(post),
    );
  }

  private async erasePost(post: Removed & { moderatedAt: Date }) {
    const media = await this.prisma.postMedia.findMany({
      where: { postId: post.id },
      select: { url: true, standardUrl: true, thumbnailUrl: true },
    });
    const comments = await this.prisma.comment.findMany({
      where: { postId: post.id },
      select: COMMENT_FILES,
    });
    const erased = await this.prisma.$transaction(async (tx) => {
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
      const { count } = await tx.post.deleteMany({
        where: {
          id: post.id,
          moderationStatus: 'REMOVED',
          moderatedAt: post.moderatedAt,
        },
      });
      return count === 1;
    });
    if (!erased) return false;
    await this.releaseFiles([
      {
        profileId: post.profileId,
        files: media.flatMap((m) => [m.url, m.standardUrl, m.thumbnailUrl]),
      },
      ...comments.map(commentFiles),
    ]);
    return true;
  }

  private eraseStories(now: Date): Promise<number> {
    return this.each(
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
      async (story) => {
        // A story cannot be appealed: nothing else keeps it.
        const { count } = await this.prisma.story.deleteMany({
          where: {
            id: story.id,
            moderationStatus: 'REMOVED',
            moderatedAt: story.moderatedAt,
          },
        });
        if (count !== 1) return false;
        await this.releaseFiles([
          {
            profileId: story.profileId,
            files: [
              story.url,
              story.standardUrl,
              story.thumbnailUrl,
              story.overlayUrl,
            ],
          },
        ]);
        return true;
      },
    );
  }

  private eraseComments(now: Date): Promise<number> {
    return this.each(
      now,
      (where) =>
        this.prisma.comment.findMany({
          where,
          orderBy: { id: 'asc' },
          take: ERASURE_BATCH_SIZE,
          select: { id: true, moderatedAt: true, ...COMMENT_FILES },
        }),
      async (comment) => {
        const replies = await this.repliesOf(comment.id);
        // A comment cannot be appealed: nothing else keeps it. Its replies
        // go with it, as the database deletes them.
        const { count } = await this.prisma.comment.deleteMany({
          where: {
            id: comment.id,
            moderationStatus: 'REMOVED',
            moderatedAt: comment.moderatedAt,
          },
        });
        if (count !== 1) return false;
        await this.releaseFiles([comment, ...replies].map(commentFiles));
        return true;
      },
    );
  }

  // Every reply under a comment, however deep.
  private async repliesOf(commentId: string) {
    const replies: Array<{ profileId: string } & CommentFileColumns> = [];
    let parents = [commentId];
    while (parents.length > 0) {
      const found = await this.prisma.comment.findMany({
        where: { parentId: { in: parents } },
        select: { id: true, ...COMMENT_FILES },
      });
      replies.push(...found);
      parents = found.map((reply) => reply.id);
    }
    return replies;
  }

  // The files of erased rows, each as its author's: only the author's own,
  // and only those no other row still names, are deleted. A file that could
  // not be deleted is left to the orphan sweep; the rows are gone already.
  private async releaseFiles(
    groups: Array<{ profileId: string; files: Files }>,
  ): Promise<void> {
    for (const { profileId, files } of groups) {
      if (!files.some(Boolean)) continue;
      try {
        await this.uploads.deleteContentFiles(profileId, files);
      } catch (error) {
        this.logger.warn(
          `Files of erased content kept: ${error instanceof Error ? error.message : error}`,
        );
      }
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
  url: string | null;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  voiceUrl: string | null;
}

function commentFiles(comment: { profileId: string } & CommentFileColumns): {
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
