import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { $Enums } from '@prisma/client';
import { Queue } from 'bullmq';
import { assertEmailVerifiedForWrite } from '../common/abuse/assert-email-verified.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';

const NotificationType = $Enums.NotificationType;

/**
 * Service for toggling and checking post likes.
 * Creates notifications for post owners on new likes.
 */
@Injectable()
export class LikesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('analytics-processing') private readonly analyticsQueue: Queue,
    @Inject(SystemSettingsService)
    private readonly systemSettings: SystemSettingsService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
  ) {}

  /**
   * Toggle like/unlike on a post. Sends notification to post owner on like.
   * @param postId - The post to like/unlike
   * @param profileId - The liking user's ID
   * @returns `{ liked: boolean }`
   * @throws NotFoundException if post not found
   */
  async toggle(postId: string, profileId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingLike = await this.prisma.like.findUnique({
      where: {
        postId_profileId: {
          postId,
          profileId,
        },
      },
    });

    if (existingLike) {
      // Unlike
      await this.prisma.like.delete({ where: { id: existingLike.id } });
      this.analyticsQueue
        .add('update-performance-score', { postId })
        .catch((err) => console.error('Failed to enqueue analytics', err));
      return { liked: false };
    } else {
      await assertEmailVerifiedForWrite(
        this.prisma,
        this.systemSettings,
        this.turnstile,
        profileId,
      );
      // Like
      await this.prisma.like.create({
        data: {
          postId,
          profileId,
        },
      });

      // Create notification for post owner
      if (post.profileId !== profileId) {
        this.eventEmitter.emit('notification.create', {
          recipientId: post.profileId,
          senderId: profileId,
          type: NotificationType.LIKE,
          content: 'liked your post',
          postId: post.id,
        });
      }

      this.analyticsQueue
        .add('update-performance-score', { postId })
        .catch((err) => console.error('Failed to enqueue analytics', err));
      return { liked: true };
    }
  }

  /**
   * Check whether a user has liked a specific post.
   * @param postId - The post ID
   * @param profileId - The user's ID
   * @returns `{ liked: boolean }`
   */
  async checkLike(postId: string, profileId: string) {
    const like = await this.prisma.like.findUnique({
      where: {
        postId_profileId: {
          postId,
          profileId,
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
        profile: {
          include: { user: true },
        },
      },
    });

    return likes.map((like) => (like as any).profile);
  }
}
