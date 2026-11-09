import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { $Enums, type Locale, Prisma } from '@prisma/client';
import { appealDeadline } from '../appeals/appeal-window.js';
import { DEFAULT_LOCALE } from '../common/constants/locale.constants.js';
import { createPaginatedResult } from '../common/dto/pagination.dto.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import { PUBLIC_PROFILE_SELECT } from '../common/selects/public-profile.select.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { pushGroupOf } from '../push/push-groups.js';
import type {
  NotificationKind,
  NotificationsQueryDto,
} from './dto/notifications-query.dto.js';
import { type Notice, renderNotice } from './notice-copy.js';
import { REMOVAL_TARGET_TYPES } from './removal-notice.js';

type NotificationType = $Enums.NotificationType;

// The notifications a Profile sees: those that lead to something shown, and
// none from a Profile it blocked or that blocked it, also when they were
// made before the block. Moderation notices stay, as when they are made.
export function shownInInbox(profileId: string): Prisma.NotificationWhereInput {
  return {
    recipientId: profileId,
    AND: [
      LINKS_TO_SHOWN_CONTENT,
      {
        OR: [
          { type: $Enums.NotificationType.MODERATION },
          { senderId: null },
          {
            sender: {
              blockedBy: { none: { blockerId: profileId } },
              blocking: { none: { blockedId: profileId } },
            },
          },
        ],
      },
    ],
  };
}

// How long a row of likes or new followers keeps taking more.
export const GROUPING_WINDOW_MS = 24 * 60 * 60 * 1000;

// Who a notification is from, as the app shows it: the latest sender and,
// for a grouped row, the one before.
const NOTIFICATION_INCLUDE = {
  sender: { select: PUBLIC_PROFILE_SELECT },
  previousSender: { select: PUBLIC_PROFILE_SELECT },
} satisfies Prisma.NotificationInclude;

// The notification types each filter of the activity page shows; "all"
// leaves the type free.
export const KIND_TYPES: Record<
  Exclude<NotificationKind, 'all'>,
  NotificationType[]
> = {
  comments: [$Enums.NotificationType.COMMENT, $Enums.NotificationType.MENTION],
  follows: [
    $Enums.NotificationType.FOLLOW,
    $Enums.NotificationType.FOLLOW_REQUEST,
    $Enums.NotificationType.FOLLOW_ACCEPTED,
  ],
  likes: [$Enums.NotificationType.LIKE, $Enums.NotificationType.COMMENT_LIKE],
};

// A notification about a post or story that moderation removed, or that its
// author deleted, leads to nothing anybody may see, and is left out. The ones
// telling the author of a moderation decision stay: they are what the author
// appeals from. A restored post or story brings its notifications back.
export const LINKS_TO_SHOWN_CONTENT = {
  OR: [
    { type: $Enums.NotificationType.MODERATION },
    {
      NOT: [
        { post: { moderationStatus: $Enums.ModerationStatus.REMOVED } },
        { story: { moderationStatus: $Enums.ModerationStatus.REMOVED } },
        { post: { deletedAt: { not: null } } },
        { story: { deletedAt: { not: null } } },
      ],
    },
  ],
} satisfies Prisma.NotificationWhereInput;

// Service for in-app notifications (CRUD, read status, unread count).
// Dispatches domain events for real-time delivery via transport adapters.
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    @Inject(PushService) private readonly pushService: PushService,
  ) {}

  private readonly logger = new Logger(NotificationsService.name);

  // The notifications of a Profile, newest first, a page at a time, of one
  // kind (comments, follows, likes) or all of them.
  async findAll(profileId: string, query: NotificationsQueryDto) {
    const { page = 1, limit = 10, kind = 'all' } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.NotificationWhereInput =
      kind === 'all'
        ? shownInInbox(profileId)
        : { ...shownInInbox(profileId), type: { in: KIND_TYPES[kind] } };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: NOTIFICATION_INCLUDE,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return createPaginatedResult(
      await this.withAppealable(
        await this.withoutBlockedPrevious(profileId, notifications),
      ),
      total,
      page,
      limit,
    );
  }

  // A grouped row names the sender before the latest; one in a block with
  // the reader, either way, is left out of it (the count stays).
  private async withoutBlockedPrevious<
    T extends { previousSenderId?: string | null },
  >(profileId: string, notifications: T[]): Promise<T[]> {
    const ids = [
      ...new Set(
        notifications
          .map((n) => n.previousSenderId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return notifications;
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: profileId, blockedId: { in: ids } },
          { blockedId: profileId, blockerId: { in: ids } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    if (blocks.length === 0) return notifications;
    const hidden = new Set(
      blocks.map((b) =>
        b.blockerId === profileId ? b.blockedId : b.blockerId,
      ),
    );
    return notifications.map((n) =>
      n.previousSenderId && hidden.has(n.previousSenderId)
        ? { ...n, previousSenderId: null, previousSender: null }
        : n,
    );
  }

  // A notice of removed content says whether the author can still appeal
  // it from there: only a post (or frame) can be, while it is still kept
  // removed, within its six months, and not appealed since it was removed.
  // The appeal itself checks all of this again.
  private async withAppealable<
    T extends { targetType: string | null; targetId: string | null },
  >(notifications: T[]): Promise<Array<T & { appealable?: boolean }>> {
    const removalTypes: Array<string | null> =
      Object.values(REMOVAL_TARGET_TYPES);
    if (!notifications.some((n) => removalTypes.includes(n.targetType))) {
      return notifications;
    }
    const postIds = notifications
      .filter((n) => n.targetType === REMOVAL_TARGET_TYPES.POST && n.targetId)
      .map((n) => n.targetId as string);

    const [posts, appeals] = postIds.length
      ? await Promise.all([
          this.prisma.post.findMany({
            where: { id: { in: postIds } },
            select: { id: true, moderationStatus: true, moderatedAt: true },
          }),
          this.prisma.appeal.findMany({
            where: { targetType: 'POST_REMOVAL', targetId: { in: postIds } },
            select: { targetId: true, createdAt: true },
          }),
        ])
      : [[], []];
    const now = new Date();
    const appealable = new Set(
      posts
        .filter(
          (post) =>
            post.moderationStatus === $Enums.ModerationStatus.REMOVED &&
            post.moderatedAt !== null &&
            appealDeadline(post.moderatedAt) >= now &&
            !appeals.some(
              (a) =>
                a.targetId === post.id &&
                a.createdAt >= (post.moderatedAt as Date),
            ),
        )
        .map((post) => post.id),
    );

    return notifications.map((n) =>
      removalTypes.includes(n.targetType)
        ? {
            ...n,
            appealable:
              n.targetType === REMOVAL_TARGET_TYPES.POST &&
              appealable.has(n.targetId as string),
          }
        : n,
    );
  }

  // Mark a single notification as read.
  // Param id: Notification ID
  // Param profileId: The recipient user's ID (for ownership check)
  async markAsRead(id: string, profileId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, recipientId: profileId },
    });

    if (!notification) {
      return null;
    }

    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  // Mark all unread notifications as read for a user.
  // Param profileId: The recipient user's ID
  async markAllAsRead(profileId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: profileId, read: false },
      data: { read: true },
    });
  }

  // Get the count of unread notifications.
  // Param profileId: The recipient user's ID
  // Returns `{ count: number }`
  async getUnreadCount(profileId: string) {
    const count = await this.prisma.notification.count({
      where: { ...shownInInbox(profileId), read: false },
    });

    return { count };
  }

  // Create a notification and broadcast it in real-time via WebSocket.
  // Uses In-Line Aggregation for batchable events (LIKE) to prevent DB spam,
  // And skips immediate push notifications to prevent push fatigue.
  // Param data: Notification payload
  @OnEvent('notification.create', { async: true })
  async create(data: {
    recipientId: string;
    // Optional: omit for system / AdminIdentity-without-linked-user notices.
    senderId?: string;
    type: NotificationType;
    // Text as written; ignored when a notice is given.
    content?: string;
    // Written in the recipient account's language (in-app and push).
    notice?: Notice;
    postId?: string;
    // What the notice is about when it is not a post, e.g. a moderation strike.
    targetType?: string;
    targetId?: string;
  }) {
    try {
      const locale = await this.recipientLocale(data.recipientId);
      const content = data.notice
        ? renderNotice(locale, data.notice)
        : (data.content ?? '');
      // Never notify across a block, in either direction. Moderation notices
      // are platform decisions, not messages from the staff member's profile,
      // so a block must not hide them from the affected participant.
      if (
        data.type !== $Enums.NotificationType.MODERATION &&
        (await isBlockedEitherWay(this.prisma, data.senderId, data.recipientId))
      ) {
        return null;
      }

      // Likes of one post (or comment likes on it) and new followers group
      // into one unread row from the last day: the latest sender, the one
      // before, and how many besides the latest. Their push waits for the
      // digest (likes) or is not sent again for the same row (follows).
      const isBatchableType = ['LIKE', 'COMMENT_LIKE'].includes(data.type);
      const isGroupable =
        (isBatchableType && !!data.postId) ||
        data.type === $Enums.NotificationType.FOLLOW;

      if (isGroupable && data.senderId) {
        const existingUnread = await this.prisma.notification.findFirst({
          where: {
            recipientId: data.recipientId,
            type: data.type,
            postId: data.postId ?? null,
            read: false,
            createdAt: { gte: new Date(Date.now() - GROUPING_WINDOW_MS) },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingUnread) {
          // Someone already in the row changes nothing.
          if (
            existingUnread.senderId === data.senderId ||
            existingUnread.previousSenderId === data.senderId
          ) {
            return existingUnread;
          }

          let newContent = content;
          if (isBatchableType) {
            // "B and others liked your post", with the latest sender's name.
            const sender = await this.prisma.profile.findUnique({
              where: { id: data.senderId },
              select: { username: true },
            });
            newContent = renderNotice(locale, {
              key: 'likes_aggregated',
              name: sender?.username ?? '',
              target: data.type === 'LIKE' ? 'post' : 'comment',
            });
          }

          const updated = await this.prisma.notification.update({
            where: { id: existingUnread.id },
            data: {
              senderId: data.senderId,
              previousSenderId: existingUnread.senderId,
              othersCount: { increment: 1 },
              content: newContent,
              createdAt: new Date(), // Bump to top
            },
            include: NOTIFICATION_INCLUDE,
          });

          this.eventEmitter.emit('notification.dispatched', {
            recipientId: data.recipientId,
            notification: updated,
          });

          return updated;
        }
      }

      // Default flow for non-batchable or first-time batchable
      // Prevent duplicate notifications if created within a short window (e.g. 1 minute)
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const existing = await this.prisma.notification.findFirst({
        where: {
          recipientId: data.recipientId,
          senderId: data.senderId,
          type: data.type,
          postId: data.postId,
          targetId: data.targetId ?? null,
          createdAt: { gte: oneMinuteAgo },
        },
      });

      if (existing) {
        return existing;
      }

      const notification = await this.prisma.notification.create({
        data: {
          recipientId: data.recipientId,
          senderId: data.senderId,
          type: data.type,
          content,
          postId: data.postId,
          targetType: data.targetType,
          targetId: data.targetId,
        } as Prisma.NotificationUncheckedCreateInput,
        include: NOTIFICATION_INCLUDE,
      });

      // Emit real-time notification via domain event
      this.eventEmitter.emit('notification.dispatched', {
        recipientId: data.recipientId,
        notification,
      });

      // Skip immediate Push Notification for batchable events
      // They will be handled by NotificationsCronService (Option B)
      if (!isBatchableType) {
        // The push service honours the switch of the Profile it is for.
        this.pushService
          .sendNotification(
            data.recipientId,
            {
              title: (notification as any).sender?.username || 'CircleSfera',
              body: content,
              data: {
                type: data.type,
                postId: data.postId,
                url: `/${(notification as any).sender?.username}`,
              },
            },
            pushGroupOf(data.type),
          )
          .catch((err) =>
            this.logger.error(`Failed to send push notification: ${err}`),
          );
      }

      return notification;
    } catch (error) {
      this.logger.error(
        `Failed to create notification for ${data.recipientId}: ${error}`,
      );
    }
  }

  // Language of the account that owns the recipient Profile.
  private async recipientLocale(profileId: string): Promise<Locale> {
    const profile = await this.prisma.profile
      .findUnique({
        where: { id: profileId },
        select: { user: { select: { locale: true } } },
      })
      .catch(() => null);
    return profile?.user?.locale ?? DEFAULT_LOCALE;
  }
}
