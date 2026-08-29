import { Inject, Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { toAdminUser } from '../../../../common/utils/user-profile-shape.util.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetModerationQueueQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(page = 1, limit = 10, targetType?: string, search?: string) {
    const skip = (page - 1) * limit;
    const raw = targetType?.toUpperCase();
    const entityFilter: 'POST' | 'STORY' | 'COMMENT' | null =
      !raw || raw === 'ALL'
        ? null
        : raw === 'FRAME'
          ? 'POST'
          : raw === 'POST' || raw === 'STORY' || raw === 'COMMENT'
            ? raw
            : null;

    const statusWhere = {
      moderationStatus: {
        in: ['FLAGGED', 'HIDDEN'] as $Enums.ModerationStatus[],
      },
    };
    const profileInclude = {
      profile: { select: { username: true, avatar: true } },
    };
    const mergeCap = Math.min(Math.max(limit * 20, 100), 500);

    type QueueRow = {
      id: string;
      entityType: 'POST' | 'STORY' | 'COMMENT';
      caption: string | null;
      type?: string;
      createdAt: Date;
      sortAt: Date;
      moderationStatus: $Enums.ModerationStatus;
      moderationNote: string | null;
      media?: unknown;
      url?: string | null;
      mediaType?: string | null;
      content?: string | null;
      user?: unknown;
    };

    const rows: QueueRow[] = [];

    const fetchPosts = entityFilter === null || entityFilter === 'POST';
    const fetchStories = entityFilter === null || entityFilter === 'STORY';
    const fetchComments = entityFilter === null || entityFilter === 'COMMENT';

    if (fetchPosts) {
      const where: Record<string, unknown> = { ...statusWhere };
      if (search) {
        where.OR = [
          { caption: { contains: search, mode: 'insensitive' } },
          {
            profile: {
              username: { contains: search, mode: 'insensitive' },
            },
          },
        ];
      }
      const posts = await this.prisma.post.findMany({
        where,
        take: mergeCap,
        orderBy: { updatedAt: 'desc' },
        include: { ...profileInclude, media: true },
      });
      for (const p of posts) {
        rows.push({
          id: p.id,
          entityType: 'POST',
          caption: p.caption,
          type: p.type,
          createdAt: p.createdAt,
          sortAt: p.updatedAt,
          moderationStatus: p.moderationStatus,
          moderationNote: p.moderationNote,
          media: p.media,
          user: toAdminUser(p.profile),
        });
      }
    }

    if (fetchStories) {
      const where: Record<string, unknown> = { ...statusWhere };
      if (search) {
        where.OR = [
          {
            profile: {
              username: { contains: search, mode: 'insensitive' },
            },
          },
        ];
      }
      const stories = await this.prisma.story.findMany({
        where,
        take: mergeCap,
        orderBy: { createdAt: 'desc' },
        include: profileInclude,
      });
      for (const s of stories) {
        rows.push({
          id: s.id,
          entityType: 'STORY',
          caption: null,
          createdAt: s.createdAt,
          sortAt: s.createdAt,
          moderationStatus: s.moderationStatus,
          moderationNote: s.moderationNote,
          url: s.url,
          mediaType: s.mediaType,
          media: s.url
            ? [
                {
                  url: s.url,
                  thumbnailUrl: s.thumbnailUrl,
                  type: s.mediaType,
                },
              ]
            : [],
          user: toAdminUser(s.profile),
        });
      }
    }

    if (fetchComments) {
      const where: Record<string, unknown> = { ...statusWhere };
      if (search) {
        where.OR = [
          { content: { contains: search, mode: 'insensitive' } },
          {
            profile: {
              username: { contains: search, mode: 'insensitive' },
            },
          },
        ];
      }
      const comments = await this.prisma.comment.findMany({
        where,
        take: mergeCap,
        orderBy: { updatedAt: 'desc' },
        include: profileInclude,
      });
      for (const c of comments) {
        rows.push({
          id: c.id,
          entityType: 'COMMENT',
          caption: c.content,
          content: c.content,
          createdAt: c.createdAt,
          sortAt: c.updatedAt,
          moderationStatus: c.moderationStatus,
          moderationNote: c.moderationNote,
          media: [],
          user: toAdminUser(c.profile),
        });
      }
    }

    rows.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
    const total = rows.length;
    const pageRows = rows
      .slice(skip, skip + limit)
      .map(({ sortAt: _s, ...rest }) => rest);

    return {
      data: pageRows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
