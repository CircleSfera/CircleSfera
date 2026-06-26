import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  type Prisma,
  type Profile,
  type StoryReaction,
  type StoryView,
  type User,
  Visibility,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { CreateStoryDto } from './dto/create-story.dto.js';

export type StoryReactionWithUser = StoryReaction & {
  user: User & {
    profile: Profile | null;
  };
};

/**
 * Service for ephemeral stories (24h expiry), story views, and reactions.
 * Supports close-friends-only visibility and tracks unique view counts.
 */
@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue('ai-processing') private readonly aiQueue: Queue,
    @Inject(UploadsService) private readonly uploadsService: UploadsService,
  ) {}

  /**
   * Create a new ephemeral story with a 24-hour expiry.
   * @param userId - The author's user ID
   * @param dto - Story data (url, mediaType, isCloseFriendsOnly, audioId)
   */
  async create(userId: string, dto: CreateStoryDto) {
    const story = await this.prisma.story.create({
      data: {
        userId,
        url: dto.url,
        standardUrl: dto.standardUrl,
        thumbnailUrl: dto.thumbnailUrl,
        mediaType: dto.mediaType || 'image',
        isCloseFriendsOnly: dto.isCloseFriendsOnly || false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        audioId: dto.audioId,
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    // Moderate content in the background (Visual Moderation)
    await this.aiQueue.add('moderate-content', {
      targetId: story.id,
      targetType: 'STORY',
      text: '', // Stories usually don't have text captions in this schema yet
      mediaUrls: [story.thumbnailUrl || story.url],
    });

    return story;
  }

  /**
   * Retrieve all active (non-expired) stories, optionally filtered to followed users.
   * Respects close-friends visibility permissions.
   * @param userId - Optional current user ID for personalized filtering
   */
  async findAll(userId?: string) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Build where clause
    const whereClause: Prisma.StoryWhereInput = {
      expiresAt: { gt: new Date() },
      createdAt: { gt: oneDayAgo },
      moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
    };

    // If userId is provided, filter to show only stories from followed users
    if (userId) {
      const following = await this.prisma.follow.findMany({
        where: { followerId: userId, status: 'ACCEPTED' },
        select: { followingId: true },
      });
      const followingIds = following.map(
        (f: { followingId: string }) => f.followingId,
      );
      // Include the user's own stories as well
      followingIds.push(userId);
      whereClause.userId = { in: followingIds };
    } else {
      // If no userId (guest), only public user stories
      whereClause.user = { settings: { privacyLevel: Visibility.PUBLIC } };
      whereClause.isCloseFriendsOnly = false;
    }

    const stories = await this.prisma.story.findMany({
      where: whereClause,
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        _count: {
          select: { views: true },
        },
        ...(userId
          ? {
              views: {
                where: { viewerId: userId },
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Remap to include isViewed boolean and clean up nested views
    const mappedStories = stories.map((s: any) => {
      const { views, ...storyData } = s;
      return {
        ...storyData,
        isViewed: userId ? (views as unknown[])?.length > 0 : false,
      };
    });

    // Check Close Friends permission
    if (userId) {
      const allowedStories = await Promise.all(
        mappedStories.map(async (story) => {
          if (!story.isCloseFriendsOnly) return story;
          if (story.userId === userId) return story; // Own story

          // Check if viewer is in story owner's close friends
          const isCloseFriend = await this.prisma.closeFriend.findUnique({
            where: {
              userId_friendId: {
                userId: story.userId,
                friendId: userId,
              },
            },
          });
          return isCloseFriend ? story : null;
        }),
      );

      return allowedStories.filter((s) => s !== null);
    }

    // Guest cannot view close friends
    return mappedStories.filter((s) => !s.isCloseFriendsOnly);
  }

  /**
   * Retrieve active stories by a specific user's username.
   * @param username - The profile username to look up
   * @param currentUserId - Optional current user for authorization check
   * @returns Array of active stories or empty array if user not found
   */
  async findByUser(username: string, currentUserId?: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      include: { user: { include: { settings: true } } },
    });

    if (!profile) {
      return [];
    }

    // Authorization check for private accounts
    const isProfilePrivate =
      profile.user.settings?.privacyLevel === Visibility.PRIVATE;
    if (isProfilePrivate && profile.userId !== currentUserId) {
      const follow = currentUserId
        ? await this.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: currentUserId,
                followingId: profile.userId,
              },
            },
          })
        : null;

      if (follow?.status !== 'ACCEPTED') {
        return []; // Return empty or throw Forbidden? Let's return empty to match findByUser style
      }
    }

    const stories = await this.prisma.story.findMany({
      where: {
        userId: profile.userId,
        expiresAt: {
          gt: new Date(),
        },
        moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        _count: {
          select: { views: true },
        },
        ...(currentUserId
          ? {
              views: {
                where: { viewerId: currentUserId },
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return stories.map((s: any) => {
      const { views, ...storyData } = s;
      return {
        ...storyData,
        isViewed: currentUserId ? (views as unknown[]).length > 0 : false,
      };
    });
  }

  /**
   * Retrieve ALL stories (active and expired) for the current user's archive.
   * Only accessible by the owner.
   * @param userId - The current user's ID
   */
  async getArchive(userId: string) {
    return this.prisma.story.findMany({
      where: {
        userId,
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        _count: {
          select: { views: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Delete a story (author only, enforced by compound where clause).
   * @param id - The story ID
   * @param userId - The requesting user's ID
   */
  async delete(id: string, userId: string): Promise<void> {
    const story = await this.prisma.story.findFirst({
      where: { id, userId },
    });

    if (story) {
      if (story.url) await this.uploadsService.deleteFile(story.url).catch(e => console.error(e));
      if (story.standardUrl) await this.uploadsService.deleteFile(story.standardUrl).catch(e => console.error(e));
      if (story.thumbnailUrl) await this.uploadsService.deleteFile(story.thumbnailUrl).catch(e => console.error(e));
      
      await this.prisma.story.delete({
        where: { id: story.id },
      });
    }
  }

  /**
   * Record a story view. Idempotent — returns existing view if already viewed.
   * @param id - The story ID
   * @param userId - The viewer's user ID
   * @returns The story view record
   */
  async view(id: string, userId: string): Promise<StoryView> {
    const existingView = await this.prisma.storyView.findUnique({
      where: {
        storyId_viewerId: {
          storyId: id,
          viewerId: userId,
        },
      },
    });

    if (existingView) return existingView;

    const newView = await this.prisma.storyView.create({
      data: {
        storyId: id,
        viewerId: userId,
      },
    });

    return newView;
  }

  /**
   * Get all viewers of a story with their profiles.
   * @param id - The story ID
   * @returns Array of users who viewed the story
   */
  async getViews(id: string): Promise<(User & { profile: Profile | null })[]> {
    const views = await this.prisma.storyView.findMany({
      where: { storyId: id },
      include: {
        viewer: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return views.map((v) => v.viewer);
  }

  /**
   * Add or update a reaction on a story. Upserts by storyId+userId.
   * @param storyId - The story ID
   * @param userId - The reacting user's ID
   * @param reaction - The emoji/reaction string
   */
  async addReaction(
    storyId: string,
    userId: string,
    reaction: string,
  ): Promise<StoryReaction> {
    const existing = await this.prisma.storyReaction.findUnique({
      where: {
        storyId_userId: {
          storyId,
          userId,
        },
      },
    });

    if (existing) {
      return this.prisma.storyReaction.update({
        where: { id: existing.id },
        data: { reaction },
      });
    }

    return this.prisma.storyReaction.create({
      data: {
        storyId,
        userId,
        reaction,
      },
    });
  }

  /**
   * Get all reactions for a story with reactor profiles.
   * @param storyId - The story ID
   */
  async getReactions(storyId: string): Promise<StoryReactionWithUser[]> {
    const reactions = await this.prisma.storyReaction.findMany({
      where: { storyId },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    return reactions as StoryReactionWithUser[];
  }

  /**
   * Cron job to physically delete expired stories every hour to free up database space.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredStories() {
    try {
      const expiredStories = await this.prisma.story.findMany({
        where: { expiresAt: { lt: new Date() } },
      });

      for (const story of expiredStories) {
        if (story.url) await this.uploadsService.deleteFile(story.url).catch(e => console.error(e));
        if (story.standardUrl) await this.uploadsService.deleteFile(story.standardUrl).catch(e => console.error(e));
        if (story.thumbnailUrl) await this.uploadsService.deleteFile(story.thumbnailUrl).catch(e => console.error(e));
      }

      const deleted = await this.prisma.story.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
      if (deleted.count > 0) {
        this.logger.log(`Cleaned up ${deleted.count} expired stories.`);
      }
    } catch (error) {
      this.logger.error('Failed to clean up expired stories', error);
    }
  }
}
