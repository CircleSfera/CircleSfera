import { Inject, Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { toAdminUser } from '../../../../common/utils/user-profile-shape.util.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

const ReportReason = $Enums.ReportReason;
type ReportReason = $Enums.ReportReason;
type ReportStatus = $Enums.ReportStatus;

@Injectable()
export class GetReportsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(
    page = 1,
    limit = 10,
    search?: string,
    status?: string,
    userId?: string,
    assignedAdminId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.ReportWhereInput = {};

    if (
      status &&
      ['PENDING', 'RESOLVED', 'REJECTED', 'REVIEWING'].includes(status)
    ) {
      where.status = status as ReportStatus;
    }

    if (userId) {
      where.targetType = 'USER';
      where.targetId = userId;
    }

    if (assignedAdminId) {
      where.assignedAdminId = assignedAdminId;
    }

    if (search) {
      const isReason = Object.values(ReportReason).includes(
        search.toUpperCase() as ReportReason,
      );

      where.OR = [
        ...(isReason ? [{ reason: search.toUpperCase() as ReportReason }] : []),
        { details: { contains: search, mode: 'insensitive' } },
        {
          reporter: {
            username: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: {
            select: { username: true, avatar: true },
          },
          assignedAdmin: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    // Enrich reports with target content details
    const enriched = await Promise.all(
      reports.map(async (report) => {
        let targetContent: {
          thumbnail?: string | null;
          text?: string | null;
          type?: string;
          author?: string;
        } | null = null;

        try {
          if (report.targetType === 'POST') {
            const post = await this.prisma.post.findUnique({
              where: { id: report.targetId },
              select: {
                caption: true,
                type: true,
                media: { take: 1, select: { url: true } },
                profile: { select: { username: true } },
              },
            });
            if (post) {
              targetContent = {
                thumbnail: post.media?.[0]?.url || null,
                text: post.caption,
                type: post.type,
                author: post.profile?.username,
              };
            }
          } else if (report.targetType === 'STORY') {
            const story = await this.prisma.story.findUnique({
              where: { id: report.targetId },
              select: {
                url: true,
                mediaType: true,
                profile: { select: { username: true } },
              },
            });
            if (story) {
              targetContent = {
                thumbnail: story.url,
                text: null,
                type: 'STORY',
                author: story.profile?.username,
              };
            }
          } else if (report.targetType === 'COMMENT') {
            const comment = await this.prisma.comment.findUnique({
              where: { id: report.targetId },
              select: {
                content: true,
                url: true,
                profile: { select: { username: true } },
              },
            });
            if (comment) {
              targetContent = {
                thumbnail: comment.url || null,
                text: comment.content,
                type: 'COMMENT',
                author: comment.profile?.username,
              };
            }
          } else if (report.targetType === 'USER') {
            const targetUser = await this.prisma.user.findUnique({
              where: { id: report.targetId },
              select: {
                email: true,
                profiles: {
                  select: { username: true, avatar: true, fullName: true },
                },
              },
            });
            if (targetUser) {
              targetContent = {
                thumbnail: targetUser.profiles[0]?.avatar || null,
                text:
                  targetUser.profiles[0]?.fullName ||
                  targetUser.profiles[0]?.username ||
                  targetUser.email,
                type: 'USER',
                author: targetUser.profiles[0]?.username,
              };
            }
          } else if (report.targetType === 'MESSAGE') {
            const message = await this.prisma.message.findUnique({
              where: { id: report.targetId },
              select: {
                content: true,
                isDeleted: true,
                mediaType: true,
                thumbnailUrl: true,
                url: true,
                sender: {
                  select: { username: true },
                },
              },
            });
            if (message) {
              const preview = message.isDeleted
                ? '[deleted]'
                : message.content?.slice(0, 280) ||
                  (message.mediaType ? `[${message.mediaType}]` : null);
              targetContent = {
                thumbnail: message.thumbnailUrl || message.url || null,
                text: preview,
                type: 'MESSAGE',
                author: message.sender?.username,
              };
            }
          }
        } catch (err) {
          console.error(
            `Error fetching report target ${report.targetId}:`,
            err,
          );
        }

        return {
          ...report,
          reporter: report.reporter ? toAdminUser(report.reporter) : null,
          targetContent,
        };
      }),
    );

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
