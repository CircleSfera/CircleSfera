import { Injectable, NotFoundException } from '@nestjs/common';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../common/pagination/keyset.util.js';
import { SHOWN_COMMENTS_COUNT } from '../common/policies/removed-content.policy.js';
import { resolveMediaFields } from '../common/utils/media-lifecycle.util.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const ARCHIVE_PAGE_DEFAULT = 24;
export const ARCHIVE_PAGE_MAX = 60;

export type ArchivedKind = 'POST' | 'FRAME';

export interface ArchivedPost {
  kind: ArchivedKind;
  id: string;
  createdAt: Date;
  archivedAt: Date;
  caption: string | null;
  mediaType: 'image' | 'video';
  url: string;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  mediaCount: number;
  likesCount: number;
  commentsCount: number;
}

// What archiving, or showing again, checks on the row it holds.
interface Held {
  profileId: string;
  deletedAt: Date | null;
  archivedAt: Date | null;
  moderationStatus: string;
}

function mediaTypeOf(type: string | null | undefined): 'image' | 'video' {
  return type === 'video' ? 'video' : 'image';
}

/**
 * A person's archive of posts and frames, shown to them only. Archiving one
 * takes it off their profile and every list, for everyone, them included,
 * and keeps its likes and comments; "Show on profile" puts it back where it
 * was, in the order of when it was published. There is no time limit. What
 * moderation removed or its author deleted is not theirs to archive or show:
 * either is answered NotFound.
 */
@Injectable()
export class ArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  /** Archives a post or frame of the Profile. Archiving it again is a no-op. */
  async archive(
    profileId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<{ id: string; archivedAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      // Held to the end: a delete, a restore or a second archive waits.
      const held = await tx.$queryRaw<Held[]>`
        SELECT "profileId", "deletedAt", "archivedAt", "moderationStatus"
        FROM "posts" WHERE id = ${id} FOR UPDATE`;
      const post = ArchiveService.ownPost(held[0], profileId);
      if (post.archivedAt) return { id, archivedAt: post.archivedAt };
      await tx.post.update({
        where: { id },
        data: { archivedAt: now },
        select: { id: true },
      });
      return { id, archivedAt: now };
    });
  }

  /** Shows an archived post or frame on the profile again, in its place. */
  async unarchive(profileId: string, id: string): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const held = await tx.$queryRaw<Held[]>`
        SELECT "profileId", "deletedAt", "archivedAt", "moderationStatus"
        FROM "posts" WHERE id = ${id} FOR UPDATE`;
      const post = ArchiveService.ownPost(held[0], profileId);
      if (post.archivedAt) {
        await tx.post.update({
          where: { id },
          data: { archivedAt: null },
          select: { id: true },
        });
      }
      return { id };
    });
  }

  /** One page of the archived posts or frames, newest archived first. */
  async list(
    profileId: string,
    kind: ArchivedKind,
    cursor?: string,
    limit: number = ARCHIVE_PAGE_DEFAULT,
  ): Promise<{ items: ArchivedPost[]; nextCursor: string | null }> {
    const size = Math.min(Math.max(limit, 1), ARCHIVE_PAGE_MAX);
    // The cursor names the last item of the page before: when it was
    // archived and its id. A malformed one starts from the top.
    const after = cursor ? decodeKeysetCursor(cursor) : null;
    const rows = await this.prisma.post.findMany({
      where: {
        profileId,
        type: kind,
        archivedAt: { not: null },
        deletedAt: null,
        moderationStatus: { not: 'REMOVED' },
        ...(after && {
          OR: [
            { archivedAt: { lt: after.createdAt } },
            { archivedAt: after.createdAt, id: { lt: after.id } },
          ],
        }),
      },
      orderBy: [{ archivedAt: 'desc' }, { id: 'desc' }],
      take: size + 1,
      select: {
        id: true,
        type: true,
        caption: true,
        createdAt: true,
        archivedAt: true,
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
        _count: { select: { likes: true, comments: SHOWN_COMMENTS_COUNT } },
      },
    });

    const page = rows.slice(0, size);
    const items: ArchivedPost[] = [];
    for (const post of page) {
      if (!post.archivedAt) continue;
      const first = post.media[0] ? resolveMediaFields(post.media[0]) : null;
      // A post with no picture is listed all the same, with an empty
      // address the app shows as a plain tile.
      items.push({
        kind: post.type === 'FRAME' ? 'FRAME' : 'POST',
        id: post.id,
        createdAt: post.createdAt,
        archivedAt: post.archivedAt,
        caption: post.caption,
        mediaType: mediaTypeOf(first?.type),
        url: first?.url ?? '',
        standardUrl: first?.standardUrl ?? null,
        thumbnailUrl: first?.thumbnailUrl ?? null,
        mediaCount: post.media.length,
        likesCount: post._count.likes,
        commentsCount: post._count.comments,
      });
    }
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        rows.length > size && last?.archivedAt
          ? encodeKeysetCursor({ createdAt: last.archivedAt, id: last.id })
          : null,
    };
  }

  // The post is the Profile's, and neither removed by moderation nor in its
  // Recently deleted.
  private static ownPost(held: Held | undefined, profileId: string): Held {
    if (
      !held ||
      held.profileId !== profileId ||
      held.deletedAt ||
      held.moderationStatus === 'REMOVED'
    ) {
      throw new NotFoundException('Post not found');
    }
    return held;
  }
}
