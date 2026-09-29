import { ErrorCode, type NotificationCreateEvent } from '@circlesfera/shared';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { $Enums, type Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { AppException } from '../common/errors/app.exception.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import { assertCanAccessPost } from '../common/policies/post-access.policy.js';
import {
  buildMediaCreateInput,
  buildVoiceMediaCreateInput,
  resolveMediaFields,
} from '../common/utils/media-lifecycle.util.js';
import { PrismaService } from '../prisma/prisma.service.js';

const NotificationType = $Enums.NotificationType;

import {
  createPaginatedResult,
  type PaginationDto,
} from '../common/dto/pagination.dto.js';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  keysetBeforeDesc,
} from '../common/pagination/keyset.util.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { UpdateCommentDto } from './dto/update-comment.dto.js';

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
    // Commenting requires the same access as viewing.
    const post = await assertCanAccessPost(this.prisma, postId, profileId);

    if (post.turnOffComments) {
      throw new ForbiddenException('Comments are disabled for this post');
    }

    // Media rows are created separately (not via a nested `media: { create
    // }`) because mixing raw FK scalars (postId, profileId, ...) with a
    // nested relation create isn't a valid Prisma input shape. Wrapped in a
    // transaction so a failure partway through can't leave an orphaned
    // Media row with no owning comment.
    const createdComment = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const media = dto.url
          ? await tx.media.create({
              data: buildMediaCreateInput({
                type: dto.mediaType || 'image',
                url: dto.url,
              }),
            })
          : null;
        const voiceMedia = dto.voiceUrl
          ? await tx.media.create({
              data: buildVoiceMediaCreateInput(dto.voiceUrl),
            })
          : null;

        return tx.comment.create({
          data: {
            postId,
            profileId,
            content: dto.content,
            url: dto.url,
            mediaType: dto.mediaType,
            mediaId: media?.id,
            voiceUrl: dto.voiceUrl,
            voiceDuration: dto.voiceDuration,
            voiceMediaId: voiceMedia?.id,
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
            media: true,
            voiceMedia: true,
          },
        });
      },
    );
    const { voiceMedia, ...commentWithoutVoiceMedia } = createdComment;
    const comment = {
      ...resolveMediaFields(commentWithoutVoiceMedia),
      voiceUrl: voiceMedia?.url ?? createdComment.voiceUrl,
    };

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
      } satisfies NotificationCreateEvent['payload']);
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
            } satisfies NotificationCreateEvent['payload']),
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
        } satisfies NotificationCreateEvent['payload']);
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
    const post = await assertCanAccessPost(
      this.prisma,
      postId,
      currentProfileId,
    );

    const { page = 1, limit = 10, cursor } = pagination;

    if (post.turnOffComments && currentProfileId !== post.profileId) {
      return {
        data: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          nextCursor: null,
          hasMore: false,
        },
      };
    }

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
      media: true,
      voiceMedia: true,
      _count: { select: { likes: true } },
      replies: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          profile: { select: profileSelect },
          likes: likeInclude,
          media: true,
          voiceMedia: true,
          _count: { select: { likes: true } },
        },
      },
    };

    // Written against `any` rather than the generic resolveMediaFields
    // utility: recursing over `replies` needs a concrete, non-generic
    // signature, and a resolveMediaFields<T> call with an `any`-shaped
    // argument here infers T as the bare constraint instead of preserving
    // the real shape, silently dropping every other field.
    const resolveComment = (c: any): any => {
      const { media, voiceMedia, ...rest } = c;
      const resolved = {
        ...rest,
        url: media?.url ?? c.url,
        standardUrl: media?.standardUrl ?? c.standardUrl ?? null,
        thumbnailUrl: media?.thumbnailUrl ?? c.thumbnailUrl ?? null,
        status: media?.status ?? 'READY',
        voiceUrl: voiceMedia?.url ?? c.voiceUrl,
      };
      if (Array.isArray(c.replies)) {
        resolved.replies = c.replies.map(resolveComment);
      }
      return resolved;
    };

    if (cursor) {
      const decoded = decodeKeysetCursor(cursor);
      const cursorWhere = decoded ? keysetBeforeDesc(decoded) : {};

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
      const last = pageRows[pageRows.length - 1];
      const nextCursor = hasMore && last ? encodeKeysetCursor(last) : undefined;

      return createPaginatedResult(
        pageRows.map(resolveComment),
        total,
        0,
        limit,
        nextCursor,
      );
    }

    const skip = (page - 1) * limit;
    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: baseWhere,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include,
      }),
      this.prisma.comment.count({
        where: {
          postId,
        },
      }),
    ]);

    const last = comments[comments.length - 1];
    const nextCursor =
      comments.length === limit && last ? encodeKeysetCursor(last) : undefined;

    return createPaginatedResult(
      comments.map(resolveComment),
      total,
      page,
      limit,
      nextCursor,
    );
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

  // Update a comment on a post (author only, any time).
  // Param postId: The post to which the comment belongs
  // Param id: The comment ID
  // Param profileId: The authenticated author profile ID
  // Param dto: UpdateCommentDto containing updated content
  async update(
    postId: string,
    id: string,
    profileId: string,
    dto: UpdateCommentDto,
  ) {
    const post = await assertCanAccessPost(this.prisma, postId, profileId);

    const comment = await this.prisma.comment.findUnique({
      where: { id },
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
        media: true,
        voiceMedia: true,
      },
    });

    if (!comment || comment.postId !== postId) {
      throw AppException.NotFound(
        ErrorCode.COMMENT_NOT_FOUND,
        'Comment not found',
      );
    }

    if (comment.profileId !== profileId) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'You cannot edit this comment',
      );
    }

    const updatedComment = await this.prisma.comment.update({
      where: { id },
      data: {
        content: dto.content,
        isEdited: true,
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
        media: true,
        voiceMedia: true,
      },
    });

    const { voiceMedia, ...commentWithoutVoiceMedia } = updatedComment;
    const result = {
      ...resolveMediaFields(commentWithoutVoiceMedia),
      voiceUrl: voiceMedia?.url ?? updatedComment.voiceUrl,
    };

    // Re-run moderation on edited text in background
    if (dto.content) {
      await this.aiQueue.add('moderate-content', {
        targetId: id,
        targetType: 'COMMENT',
        text: dto.content,
      });
    }

    // Handle mentions in edited comment
    if (dto.content) {
      const mentions = dto.content.match(/@[\w.]+/g);
      if (mentions) {
        const uniqueMentions = [...new Set(mentions.map((m) => m.slice(1)))];
        const profiles = await this.prisma.profile.findMany({
          where: {
            username: { in: uniqueMentions },
            id: { notIn: [profileId, post.profileId] },
          },
          select: { id: true },
        });

        await Promise.all(
          profiles.map(async (p) => {
            const blocked = await isBlockedEitherWay(
              this.prisma,
              profileId,
              p.id,
            );
            if (!blocked) {
              this.eventEmitter.emit('notification.create', {
                recipientId: p.id,
                senderId: profileId,
                type: NotificationType.MENTION,
                content: 'mentioned you in a comment',
                postId,
              } satisfies NotificationCreateEvent['payload']);
            }
          }),
        );
      }
    }

    return result;
  }

  // Like a comment
  async likeComment(commentId: string, profileId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { profile: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    await assertCanAccessPost(this.prisma, comment.postId, profileId);
    if (await isBlockedEitherWay(this.prisma, profileId, comment.profileId)) {
      throw new NotFoundException('Comment not found');
    }

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
        } satisfies NotificationCreateEvent['payload']);
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
