import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { $Enums, type Locale, Prisma } from '@prisma/client';
import { DEFAULT_LOCALE } from '../common/constants/locale.constants.js';
import type { PaginationDto } from '../common/dto/pagination.dto.js';
import { createPaginatedResult } from '../common/dto/pagination.dto.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import { PUBLIC_USER_SELECT } from '../common/selects/public-user.select.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { type Notice, renderNotice } from './notice-copy.js';

type NotificationType = $Enums.NotificationType;

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

  // List all notifications for a user, paginated, newest first.
  // Param profileId: The recipient user's ID
  // Param pagination: Page and limit
  async findAll(profileId: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipientId: profileId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { include: { user: { select: PUBLIC_USER_SELECT } } },
        },
      }),
      this.prisma.notification.count({ where: { recipientId: profileId } }),
    ]);

    return createPaginatedResult(notifications, total, page, limit);
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
      where: { recipientId: profileId, read: false },
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

      // Option A: In-Line Aggregation for engagement metrics
      const isBatchableType = ['LIKE', 'COMMENT_LIKE'].includes(data.type);

      if (isBatchableType && data.postId) {
        // Find an existing unread notification for this exact post and type
        const existingUnread = await this.prisma.notification.findFirst({
          where: {
            recipientId: data.recipientId,
            type: data.type,
            postId: data.postId,
            read: false,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existingUnread) {
          // Prevent exact duplicates from the same sender
          if (existingUnread.senderId === data.senderId) {
            return existingUnread;
          }

          // "B and others liked your post", with the latest sender's name.
          const sender = data.senderId
            ? await this.prisma.profile.findUnique({
                where: { id: data.senderId },
                select: { username: true },
              })
            : null;
          const newContent = renderNotice(locale, {
            key: 'likes_aggregated',
            name: sender?.username ?? '',
            target: data.type === 'LIKE' ? 'post' : 'comment',
          });

          const updated = await this.prisma.notification.update({
            where: { id: existingUnread.id },
            data: {
              senderId: data.senderId, // Update to the latest sender
              content: newContent,
              createdAt: new Date(), // Bump to top
            },
            include: {
              sender: { include: { user: { select: PUBLIC_USER_SELECT } } },
            },
          });

          // Emit real-time notification update via domain event
          this.eventEmitter.emit('notification.dispatched', {
            recipientId: data.recipientId,
            notification: updated,
          });

          // We DO NOT send an immediate push here. The Cron job handles it.
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
        include: {
          sender: { include: { user: { select: PUBLIC_USER_SELECT } } },
        },
      });

      // Emit real-time notification via domain event
      this.eventEmitter.emit('notification.dispatched', {
        recipientId: data.recipientId,
        notification,
      });

      // Skip immediate Push Notification for batchable events
      // They will be handled by NotificationsCronService (Option B)
      if (!isBatchableType) {
        const settings = await this.prisma.userSettings.findFirst({
          where: { user: { profiles: { some: { id: data.recipientId } } } },
          select: { pushNotifications: true },
        });
        if (settings?.pushNotifications === false) {
          return notification;
        }

        this.pushService
          .sendNotification(data.recipientId, {
            title: (notification as any).sender?.username || 'CircleSfera',
            body: content,
            data: {
              type: data.type,
              postId: data.postId,
              url: `/${(notification as any).sender?.username}`,
            },
          })
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
