import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { $Enums } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';

const NotificationType = $Enums.NotificationType;

import {
  createPaginatedResult,
  type PaginationDto,
} from '../common/dto/pagination.dto.js';
import { keysetBeforeDesc } from '../common/pagination/keyset.util.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

// Service for creating, listing, and deleting comments on posts.
// Supports threaded replies (parentId), media attachments, and @mention notifications.
@Injectable()
export class CommentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('ai-processing') private readonly aiQueue: Queue,
    @InjectQueue('analytics-processing') private readonly analyticsQueue: Queue,
  ) {}

  // Create a comment on a post. Sends notifications to the post owner, mentioned users,
  // And (if a reply) the parent comment author.
  // Param postId: The post to comment on
  // Param profileId: The commenting user's ID
  // Param dto: Comment data (content, optional parentId, url, mediaType)
  // Throws NotFoundException if the post does not exist
  async create(postId: string, profileId: string, dto: CreateCommentDto) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comment = await this.prisma.comment.create({
      data: {
        postId,
        profileId,
        content: dto.content,
        url: dto.url,
        mediaType: dto.mediaType,
        voiceUrl: dto.voiceUrl,
        voiceDuration: dto.voiceDuration,
        voiceWaveform: dto.voiceWaveform
          ? JSON.parse(JSON.stringify(dto.voiceWaveform))
          : undefined,
      },
      include: {
        profile: {
          select: {
            id: true,
            username: true,
            avatar: true,
            fullName: true,
            verificationLevel: true,
            accountType: true,
          },
        },
      },
    });

    // Moderate content in the background
    if (dto.content) {
      await this.aiQueue.add('moderate-content', {
        targetId: comment.id,
        targetType: 'COMMENT',
        text: dto.content,
      });
    }

    // Create notification for post owner
    if (post.profileId !== profileId) {
      this.eventEmitter.emit('notification.create', {
        recipientId: post.profileId,
        senderId: profileId,
        type: 'COMMENT',
        content: 'commented on your post',
        postId: post.id,
      });
    }

    // Handle Mentions
    if (dto.content) {
      // We can't use the simple regex here because we need to import it,
      // But since we are modifying the file, let's just duplicate logic or cleaner:
      // Actually I should import the utils I just created.
      // But let's look at the file content I have.
      // I will add the import in a separate block if needed, or I can use dynamic import or just regex here for safety if imports are tricky with replace_file_content
      // Let's rely on the regex I used in the plan for now to avoid import errors if I mess up the top of file
      const mentions = dto.content.match(/@[\w.]+/g);
      if (mentions) {
        const uniqueMentions = [...new Set(mentions.map((m) => m.slice(1)))];

        // Find users mentioned
        const profiles = await this.prisma.profile.findMany({
          where: {
            username: { in: uniqueMentions },
            id: { notIn: [profileId, post.profileId] }, // Don't notify self or post owner (already notified)
          },
          select: { id: true },
        });

        await Promise.all(
          profiles.map((profile) =>
            this.eventEmitter.emit('notification.create', {
              recipientId: profile.id,
              senderId: profileId,
              type: NotificationType.MENTION,
              content: 'mentioned you in a comment',
              postId: post.id,
            }),
          ),
        );
      }
    }

    // Create notification for parent comment owner (if reply)
    if (dto.parentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
      });

      if (parentComment && parentComment.profileId !== profileId) {
        // Only notify if not already notified by mention or post owner check
        // Simplicity: just notify. Users might get 2 notifications if they are also mentioned.
        // That is acceptable for now.
        this.eventEmitter.emit('notification.create', {
          recipientId: parentComment.profileId,
          senderId: profileId,
          type: 'COMMENT',
          content: 'replied to your comment',
          postId: post.id,
        });
      }
    }

    // Trigger score recalculation
    await this.analyticsQueue.add('update-performance-score', { postId });

    return comment;
  }

  // Retrieve top-level comments for a post with nested replies, paginated.
  // Param postId: The post ID
  // Param pagination: Page and limit parameters
  // Param currentProfileId: Optional viewer profile for isLiked hydration
  // Lists top-level comments on a post, newest first. Supports two modes
  // (DATA-003):
  //  - `pagination.cursor` set: keyset pagination, stable under concurrent
  //    inserts (a comment posted ahead of the cursor never shifts an
  //    already-fetched page) — the resolution path for high-traffic/viral
  //    threads.
  //  - no cursor: the original page/skip path, kept for backward
  //    compatibility with existing callers that jump to an arbitrary page
  //    number. `nextCursor` is populated either way so a caller can switch
  //    to cursor-based continuation from any page onward.
  async findByPost(
    postId: string,
    pagination: PaginationDto,
    currentProfileId?: string,
  ) {
    const { page = 1, limit = 10, cursor } = pagination;

    const likeInclude = currentProfileId
      ? {
          where: { profileId: currentProfileId },
          take: 1,
          select: { id: true, profileId: true },
        }
      : false;

    const profileSelect = {
      id: true,
      username: true,
      avatar: true,
      fullName: true,
      verificationLevel: true,
      accountType: true,
    } as const;

    const baseWhere = {
      postId,
      parentId: null,
      moderationStatus: {
        in: ['VISIBLE', 'FLAGGED'] as ('VISIBLE' | 'FLAGGED')[],
      },
    };
    const include = {
      profile: { select: profileSelect },
      likes: likeInclude,
      _count: { select: { likes: true } },
      replies: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          profile: { select: profileSelect },
          likes: likeInclude,
          _count: { select: { likes: true } },
        },
      },
    };

    if (cursor) {
      const cursorRow = await this.prisma.comment.findUnique({
        where: { id: cursor },
        select: { createdAt: true, id: true },
      });
      const cursorWhere = cursorRow ? keysetBeforeDesc(cursorRow) : {};

      const [comments, total] = await Promise.all([
        this.prisma.comment.findMany({
          where: { ...baseWhere, ...cursorWhere },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          include,
        }),
        this.prisma.comment.count({ where: { postId } }),
      ]);

      const hasMore = comments.length > limit;
      const pageRows = hasMore ? comments.slice(0, limit) : comments;
      const nextCursor = hasMore
        ? pageRows[pageRows.length - 1]?.id
        : undefined;

      return createPaginatedResult(pageRows, total, 0, limit, nextCursor);
    }

    const skip = (page - 1) * limit;
    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: baseWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include,
      }),
      this.prisma.comment.count({
        where: {
          postId,
        },
      }),
    ]);

    const nextCursor =
      comments.length === limit ? comments[comments.length - 1]?.id : undefined;

    return createPaginatedResult(comments, total, page, limit, nextCursor);
  }

  // Delete a comment. Ownership is enforced by OwnershipGuard at the controller level.
  async remove(id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.prisma.comment.delete({ where: { id } });

    // Trigger score recalculation
    await this.analyticsQueue.add('update-performance-score', {
      postId: comment.postId,
    });
  }

  // Like a comment
  async likeComment(commentId: string, profileId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { profile: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const existingLike = await this.prisma.commentLike.findUnique({
      where: { commentId_profileId: { commentId, profileId } },
    });

    if (!existingLike) {
      await this.prisma.commentLike.create({
        data: { commentId, profileId },
      });

      if (comment.profileId !== profileId) {
        this.eventEmitter.emit('notification.create', {
          recipientId: comment.profileId,
          senderId: profileId,
          type: NotificationType.COMMENT_LIKE,
          content: 'liked your comment.',
          postId: comment.postId,
        });
      }
    }
  }

  // Unlike a comment
  async unlikeComment(commentId: string, profileId: string) {
    const existingLike = await this.prisma.commentLike.findUnique({
      where: { commentId_profileId: { commentId, profileId } },
    });

    if (existingLike) {
      await this.prisma.commentLike.delete({
        where: { id: existingLike.id },
      });
    }
  }
}
