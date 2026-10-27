import { Injectable, NotFoundException } from '@nestjs/common';
import { resolveMediaFields } from '../common/utils/media-lifecycle.util.js';
import {
  erasePost,
  eraseStory,
  STORY_FILES,
} from '../maintenance/content-erasure.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DELETED_CONTENT_KEPT_DAYS,
  StoredFilesService,
} from '../uploads/services/stored-files.service.js';
import { UploadsService } from '../uploads/uploads.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// The most of each kind the list shows: 30 days of what one Profile deleted.
export const RECENTLY_DELETED_LIST_LIMIT = 300;
// A restore reads and writes a few rows; erasing deletes files too.
const RESTORE_TRANSACTION = { timeout: 30_000, maxWait: 5_000 };
export const ERASE_TRANSACTION = { timeout: 60_000, maxWait: 5_000 };

export type RecentlyDeletedKind = 'POST' | 'FRAME' | 'STORY';

export interface RecentlyDeletedItem {
  kind: RecentlyDeletedKind;
  id: string;
  deletedAt: Date;
  createdAt: Date;
  daysLeft: number;
  caption: string | null;
  mediaType: 'image' | 'video';
  url: string;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  mediaCount: number;
}

// What a restore or an erasure checks on the row it holds.
interface Held {
  profileId: string;
  deletedAt: Date | null;
  moderationStatus: string;
}

/** The time before which a deletion is past its 30 days. */
export function recentlyDeletedCutoff(now: Date): Date {
  return new Date(now.getTime() - DELETED_CONTENT_KEPT_DAYS * DAY_MS);
}

function daysLeft(deletedAt: Date, now: Date): number {
  const ends = deletedAt.getTime() + DELETED_CONTENT_KEPT_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((ends - now.getTime()) / DAY_MS));
}

function mediaTypeOf(type: string | null | undefined): 'image' | 'video' {
  return type === 'video' ? 'video' : 'image';
}

/**
 * A person's Recently deleted: the posts, frames and stories they deleted in
 * the last 30 days, shown to them only. They can restore one, as it was, in
 * its place, with its likes and comments, or delete it for good at once.
 * What moderation removed is not theirs to restore or erase: it is kept for
 * its appeal, out of their reach, and is not listed.
 */
@Injectable()
export class RecentlyDeletedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storedFiles: StoredFilesService,
    private readonly uploads: UploadsService,
  ) {}

  /** Newest deleted first. */
  async list(
    profileId: string,
    now: Date = new Date(),
  ): Promise<{ items: RecentlyDeletedItem[] }> {
    const where = {
      profileId,
      deletedAt: { gte: recentlyDeletedCutoff(now) },
      moderationStatus: { not: 'REMOVED' as const },
    };
    const posts = await this.prisma.post.findMany({
      where,
      orderBy: { deletedAt: 'desc' },
      take: RECENTLY_DELETED_LIST_LIMIT,
      select: {
        id: true,
        type: true,
        caption: true,
        createdAt: true,
        deletedAt: true,
        media: {
          orderBy: { order: 'asc' },
          select: {
            url: true,
            standardUrl: true,
            thumbnailUrl: true,
            type: true,
            media: true,
          },
        },
      },
    });
    const stories = await this.prisma.story.findMany({
      where,
      orderBy: { deletedAt: 'desc' },
      take: RECENTLY_DELETED_LIST_LIMIT,
      select: {
        id: true,
        createdAt: true,
        deletedAt: true,
        url: true,
        standardUrl: true,
        thumbnailUrl: true,
        mediaType: true,
        media: true,
      },
    });

    const items: RecentlyDeletedItem[] = [];
    for (const post of posts) {
      const first = post.media[0] ? resolveMediaFields(post.media[0]) : null;
      // A post may have no picture at all: it is listed all the same, with
      // an empty address the app shows as a plain tile.
      if (!post.deletedAt) continue;
      items.push({
        kind: post.type === 'FRAME' ? 'FRAME' : 'POST',
        id: post.id,
        deletedAt: post.deletedAt,
        createdAt: post.createdAt,
        daysLeft: daysLeft(post.deletedAt, now),
        caption: post.caption,
        mediaType: mediaTypeOf(first?.type),
        url: first?.url ?? '',
        standardUrl: first?.standardUrl ?? null,
        thumbnailUrl: first?.thumbnailUrl ?? null,
        mediaCount: post.media.length,
      });
    }
    for (const story of stories) {
      if (!story.deletedAt) continue;
      const shown = resolveMediaFields(story);
      items.push({
        kind: 'STORY',
        id: story.id,
        deletedAt: story.deletedAt,
        createdAt: story.createdAt,
        daysLeft: daysLeft(story.deletedAt, now),
        caption: null,
        mediaType: mediaTypeOf(story.mediaType),
        url: shown.url,
        standardUrl: shown.standardUrl,
        thumbnailUrl: shown.thumbnailUrl,
        mediaCount: 1,
      });
    }
    items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
    return { items };
  }

  /**
   * Puts a deleted post or frame back where it was, with its likes and
   * comments, and its files readable again by whoever may see it.
   */
  async restorePost(
    profileId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<{ id: string; kind: 'POST' | 'FRAME' }> {
    return this.prisma.$transaction(async (tx) => {
      const held = await tx.$queryRaw<Held[]>`
        SELECT "profileId", "deletedAt", "moderationStatus" FROM "posts"
        WHERE id = ${id} FOR UPDATE`;
      this.assertRestorable(held[0], profileId, now, 'Post');
      const post = await tx.post.update({
        where: { id },
        data: { deletedAt: null },
        select: {
          type: true,
          media: {
            select: { url: true, standardUrl: true, thumbnailUrl: true },
          },
        },
      });
      await this.storedFiles.reattach(
        post.media.flatMap((m) => [m.url, m.standardUrl, m.thumbnailUrl]),
        tx,
      );
      return { id, kind: post.type === 'FRAME' ? 'FRAME' : 'POST' };
    }, RESTORE_TRANSACTION);
  }

  /**
   * Puts a deleted story back. One whose 24 hours are over goes back to the
   * archive only, not to the tray: `archived` says so.
   */
  async restoreStory(
    profileId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<{ id: string; archived: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const held = await tx.$queryRaw<Held[]>`
        SELECT "profileId", "deletedAt", "moderationStatus" FROM "stories"
        WHERE id = ${id} FOR UPDATE`;
      this.assertRestorable(held[0], profileId, now, 'Story');
      const story = await tx.story.update({
        where: { id },
        data: { deletedAt: null },
        select: { expiresAt: true, ...STORY_FILES },
      });
      await this.storedFiles.reattach(
        [story.url, story.standardUrl, story.thumbnailUrl, story.overlayUrl],
        tx,
      );
      return { id, archived: story.expiresAt <= now };
    }, RESTORE_TRANSACTION);
  }

  /**
   * Deletes a post or frame of Recently deleted for good, at once: its files
   * and its comments' files (each only if its author's own and named by no
   * other row), then the row with everything that hangs from it.
   */
  async erasePost(profileId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const held = await tx.$queryRaw<Held[]>`
        SELECT "profileId", "deletedAt", "moderationStatus" FROM "posts"
        WHERE id = ${id} FOR UPDATE`;
      this.assertErasable(held[0], profileId, 'Post');
      await erasePost(tx, this.uploads, { id, profileId });
    }, ERASE_TRANSACTION);
  }

  /** Deletes a story of Recently deleted for good, at once: files, then row. */
  async eraseStory(profileId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const held = await tx.$queryRaw<Held[]>`
        SELECT "profileId", "deletedAt", "moderationStatus" FROM "stories"
        WHERE id = ${id} FOR UPDATE`;
      this.assertErasable(held[0], profileId, 'Story');
      const story = await tx.story.findUniqueOrThrow({
        where: { id },
        select: STORY_FILES,
      });
      await eraseStory(tx, this.uploads, { id, profileId, ...story });
    }, ERASE_TRANSACTION);
  }

  // Only its author acts on a deleted post or story, and only while it is in
  // their Recently deleted; anything else answers as missing, so nobody
  // learns that another person's content exists.
  private assertErasable(
    row: Held | undefined,
    profileId: string,
    label: 'Post' | 'Story',
  ): asserts row is Held & { deletedAt: Date } {
    if (
      !row ||
      row.profileId !== profileId ||
      !row.deletedAt ||
      row.moderationStatus === 'REMOVED'
    ) {
      throw new NotFoundException(`${label} not found`);
    }
  }

  // A restore also needs the deletion to be within its 30 days: past them,
  // the content is waiting for the nightly erasure.
  private assertRestorable(
    row: Held | undefined,
    profileId: string,
    now: Date,
    label: 'Post' | 'Story',
  ): void {
    this.assertErasable(row, profileId, label);
    if (row.deletedAt < recentlyDeletedCutoff(now)) {
      throw new NotFoundException(`${label} not found`);
    }
  }
}
