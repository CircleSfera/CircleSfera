import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import type { Queue } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const NotificationType = $Enums.NotificationType;

/**
 * Service for toggling and checking post likes.
 * Creates notifications for post owners on new likes.
 */
@Injectable()
export class LikesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @InjectQueue('analytics-processing') private readonly analyticsQueue: Queue,
  ) {}

  /**
   * Toggle like/unlike on a post. Sends notification to post owner on like.
   * @param postId - The post to like/unlike
   * @param userId - The liking user's ID
   * @returns `{ liked: boolean }`
   * @throws NotFoundException if post not found
   */
  async toggle(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingLike = await this.prisma.like.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existingLike) {
      // Unlike
      await this.prisma.like.delete({ where: { id: existingLike.id } });
      await this.analyticsQueue.add('update-performance-score', { postId });
      return { liked: false };
    } else {
      // Like
      await this.prisma.like.create({
        data: {
          postId,
          userId,
        },
      });

      // Create notification for post owner
      if (post.userId !== userId) {
        await this.notificationsService.create({
          recipientId: post.userId,
          senderId: userId,
          type: NotificationType.LIKE,
          content: 'liked your post',
          postId: post.id,
        });
      }

      await this.analyticsQueue.add('update-performance-score', { postId });
      return { liked: true };
    }
  }

  /**
   * Check whether a user has liked a specific post.
   * @param postId - The post ID
   * @param userId - The user's ID
   * @returns `{ liked: boolean }`
   */
  async checkLike(postId: string, userId: string) {
    const like = await this.prisma.like.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    return { liked: !!like };
  }

  /**
   * Get all users who have liked a specific post.
   * @param postId - The post ID
   * @returns Array of users with profiles
   */
  async getLikesByPost(postId: string) {
    const likes = await this.prisma.like.findMany({
      where: { postId },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    return likes.map((like) => like.user);
  }
}
