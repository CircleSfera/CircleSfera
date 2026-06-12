import { Inject, Injectable } from '@nestjs/common';
import type { $Enums, Prisma } from '@prisma/client';
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
   * @param data - Notification payload (recipientId, senderId, type, content, optional postId)
   */
  async create(data: {
    recipientId: string;
    senderId: string;
    type: NotificationType;
    content: string;
    postId?: string;
  }) {
    // Prevent duplicate notifications if created within a short window (e.g. 1 minute)
    // for the same sender, recipient, and type.
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

    // Send Native Push Notification
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

    return notification;
  }
}
