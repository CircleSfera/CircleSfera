import { Inject, Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type { PaginationDto } from '../common/dto/pagination.dto.js';
import { createPaginatedResult } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { AppGateway } from '../socket/app.gateway.js';

type NotificationType = $Enums.NotificationType;

/**
 * Service for in-app notifications (CRUD, read status, unread count).
 * Sends real-time notifications via AppGateway WebSocket.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppGateway) private readonly appGateway: AppGateway,
    @Inject(PushService) private readonly pushService: PushService,
  ) {}

  /**
   * List all notifications for a user, paginated, newest first.
   * @param userId - The recipient user's ID
   * @param pagination - Page and limit
   */
  async findAll(userId: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipientId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            include: {
              profile: true,
            },
          },
        },
      }),
      this.prisma.notification.count({ where: { recipientId: userId } }),
    ]);

    return createPaginatedResult(notifications, total, page, limit);
  }

  /**
   * Mark a single notification as read.
   * @param id - Notification ID
   * @param userId - The recipient user's ID (for ownership check)
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, recipientId: userId },
    });

    if (!notification) {
      return null;
    }

    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  /**
   * Mark all unread notifications as read for a user.
   * @param userId - The recipient user's ID
   */
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });
  }

  /**
   * Get the count of unread notifications.
   * @param userId - The recipient user's ID
   * @returns `{ count: number }`
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, read: false },
    });

    return { count };
  }

  /**
   * Create a notification and broadcast it in real-time via WebSocket.
   * Uses In-Line Aggregation for batchable events (LIKE) to prevent DB spam,
   * and skips immediate push notifications to prevent push fatigue.
   * @param data - Notification payload
   */
  async create(data: {
    recipientId: string;
    senderId: string;
    type: NotificationType;
    content: string;
    postId?: string;
  }) {
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

        // Aggregate text logic. "User A liked your post" -> "A User B y otras personas les gustó..."
        const senderName = data.content.split(' ')[0];
        const newContent =
          data.type === 'LIKE'
            ? `A ${senderName} y a otras personas les gustó tu publicación`
            : `A ${senderName} y a otras personas les gustó tu comentario`;

        const updated = await this.prisma.notification.update({
          where: { id: existingUnread.id },
          data: {
            senderId: data.senderId, // Update to the latest sender
            content: newContent,
            createdAt: new Date(), // bump to top
          },
          include: {
            sender: {
              include: {
                profile: true,
              },
            },
          },
        });

        // Emit real-time notification update via Socket.io
        this.appGateway.sendNotification(data.recipientId, updated);

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
        content: data.content,
        postId: data.postId,
      } as Prisma.NotificationUncheckedCreateInput,
      include: {
        sender: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Emit real-time notification via Socket.io
    this.appGateway.sendNotification(data.recipientId, notification);

    // Skip immediate Push Notification for batchable events
    // They will be handled by NotificationsCronService (Option B)
    if (!isBatchableType) {
      this.pushService
        .sendNotification(data.recipientId, {
          title: notification.sender?.profile?.username || 'CircleSfera',
          body: data.content,
          data: {
            type: data.type,
            postId: data.postId,
            url: `/${notification.sender?.profile?.username}`,
          },
        })
        .catch((err) => console.error('Failed to send push notification', err));
    }

    return notification;
  }
}
