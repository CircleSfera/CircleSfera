import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  type Prisma,
  type Profile,
  type StoryReaction,
  type StoryView,
  type User,
  Visibility,
} from '@prisma/client';
import { Queue } from 'bullmq';
import {
  MAX_PPV_PRICE_CENTS,
  MIN_PPV_PRICE_CENTS,
} from '../common/constants/monetization.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
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
    private readonly eventEmitter: EventEmitter2,
    @Inject(SystemSettingsService)
    private readonly systemSettings: SystemSettingsService,
  ) {}

  /**
   * Create a new ephemeral story with a 24-hour expiry.
   * @param profileId - The author's user ID
   * @param dto - Story data (url, mediaType, isCloseFriendsOnly, audioId)
   */
  async create(profileId: string, dto: CreateStoryDto) {
    const postingEnabled = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.CONTENT_POSTING_ENABLED,
    );
    if (!postingEnabled) {
      throw new ForbiddenException('CONTENT_POSTING_DISABLED');
    }

    if (dto.isPremium) {
      if (
        !dto.priceCents ||
        dto.priceCents < MIN_PPV_PRICE_CENTS ||
        dto.priceCents > MAX_PPV_PRICE_CENTS
      ) {
        throw new BadRequestException(
          `El precio de la historia premium debe estar entre €${(MIN_PPV_PRICE_CENTS / 100).toFixed(2)} y €${(MAX_PPV_PRICE_CENTS / 100).toFixed(2)}.`,
        );
      }
    }
    const scheduledAt =
      dto.scheduledAt && new Date(dto.scheduledAt) > new Date()
        ? new Date(dto.scheduledAt)
        : undefined;

    const story = await this.prisma.story.create({
      data: {
        profileId,
        url: dto.url,
        standardUrl: dto.standardUrl,
        thumbnailUrl: dto.thumbnailUrl,
        mediaType: dto.mediaType || 'image',
        isCloseFriendsOnly: dto.isCloseFriendsOnly || false,
        isPremium: dto.isPremium || false,
        priceCents: dto.isPremium ? dto.priceCents || 0 : 0,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        audioId: dto.audioId,
        scheduledAt: scheduledAt ?? null,
        scheduledStatus: scheduledAt ? 'SCHEDULED' : 'PUBLISHED',
      },
      include: {
        profile: { include: { user: true } },
      },
    });

    // Skip fan-out moderation side effects for still-scheduled stories
    if (scheduledAt) {
      return story;
    }

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
   * @param profileId - Optional current user ID for personalized filtering
   */
  async findAll(profileId?: string) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Build where clause
    const whereClause: Prisma.StoryWhereInput = {
      expiresAt: { gt: new Date() },
      createdAt: { gt: oneDayAgo },
      moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
      scheduledStatus: 'PUBLISHED',
    };

    // If profileId is provided, filter to show only stories from followed users
    if (profileId) {
      const following = await this.prisma.follow.findMany({
        where: { followerId: profileId, status: 'ACCEPTED' },
        select: { followingId: true },
      });
      const followingIds = following.map(
        (f: { followingId: string }) => f.followingId,
      );
      // Include the user's own stories as well
      followingIds.push(profileId);
      whereClause.profileId = { in: followingIds };
    } else {
      // If no profileId (guest), only public user stories
      whereClause.profile = {
        user: { settings: { privacyLevel: Visibility.PUBLIC } },
      };
      whereClause.isCloseFriendsOnly = false;
    }

    const stories = await this.prisma.story.findMany({
      where: whereClause,
      include: {
        profile: { include: { user: true } },
        poll: { select: { id: true } },
        qnaBox: { select: { id: true } },
        _count: {
          select: { views: true },
        },
        ...(profileId
          ? {
              views: {
                where: { viewerId: profileId },
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
        isViewed: profileId ? (views as unknown[])?.length > 0 : false,
      };
    });

    // Check Close Friends permission
    if (profileId) {
      const allowedStories = await Promise.all(
        mappedStories.map(async (story) => {
          if (!story.isCloseFriendsOnly) return story;
          if (story.profileId === profileId) return story; // Own story

          // Check if viewer is in story owner's close friends
          const isCloseFriend = await this.prisma.closeFriend.findUnique({
            where: {
              profileId_friendId: {
                profileId: story.profileId,
                friendId: profileId,
              },
            },
          });
          return isCloseFriend ? story : null;
        }),
      );

      const visible = allowedStories.filter((s) => s !== null);
      return this.applyStoryPremiumLocks(visible, profileId);
    }

    // Guest cannot view close friends
    return this.applyStoryPremiumLocks(
      mappedStories.filter((s) => !s.isCloseFriendsOnly),
      undefined,
    );
  }

  /** Redact media URLs for premium stories the viewer has not unlocked. */
  private async applyStoryPremiumLocks<
    T extends {
      id: string;
      profileId: string;
      isPremium?: boolean;
      url?: string;
      standardUrl?: string | null;
      thumbnailUrl?: string | null;
    },
  >(stories: T[], viewerId?: string): Promise<(T & { isLocked?: boolean })[]> {
    const premiumIds = stories
      .filter((s) => s.isPremium && s.profileId !== viewerId)
      .map((s) => s.id);
    if (premiumIds.length === 0) {
      return stories.map((s) => ({ ...s, isLocked: false }));
    }

    const unlocked = viewerId
      ? await (async () => {
          const viewer = await this.prisma.profile.findUnique({
            where: { id: viewerId },
            select: { userId: true },
          });
          if (!viewer) return [];
          return this.prisma.storyUnlock.findMany({
            where: { userId: viewer.userId, storyId: { in: premiumIds } },
            select: { storyId: true },
          });
        })()
      : [];
    const unlockedSet = new Set(
      unlocked.map((u: { storyId: string }) => u.storyId),
    );

    return stories.map((s) => {
      if (!s.isPremium || s.profileId === viewerId || unlockedSet.has(s.id)) {
        return { ...s, isLocked: false };
      }
      return {
        ...s,
        isLocked: true,
        url: s.thumbnailUrl || '',
        standardUrl: null,
      };
    });
  }

  /**
   * Retrieve active stories by a specific user's username.
   * @param username - The profile username to look up
   * @param currentProfileId - Optional current user for authorization check
   * @returns Array of active stories or empty array if user not found
   */
  async findByUser(username: string, currentProfileId?: string) {
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
    if (isProfilePrivate && profile.id !== currentProfileId) {
      const follow = currentProfileId
        ? await this.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: currentProfileId,
                followingId: profile.id,
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
        profileId: profile.id,
        expiresAt: {
          gt: new Date(),
        },
        moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
      },
      include: {
        profile: { include: { user: true } },
        _count: {
          select: { views: true },
        },
        ...(currentProfileId
          ? {
              views: {
                where: { viewerId: currentProfileId },
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const mapped = stories.map((s: any) => {
      const { views, ...storyData } = s;
      return {
        ...storyData,
        isViewed: currentProfileId ? (views as unknown[]).length > 0 : false,
      };
    });
    return this.applyStoryPremiumLocks(mapped, currentProfileId);
  }

  /**
   * Retrieve ALL stories (active and expired) for the current user's archive.
   * Only accessible by the owner.
   * @param profileId - The current user's ID
   */
  async getArchive(profileId: string) {
    return this.prisma.story.findMany({
      where: {
        profileId,
      },
      include: {
        profile: { include: { user: true } },
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
   * @param profileId - The requesting user's ID
   */
  async delete(id: string, profileId: string): Promise<void> {
    const story = await this.prisma.story.findFirst({
      where: { id, profileId },
    });

    if (story) {
      if (story.url)
        await this.uploadsService
          .deleteFile(story.url)
          .catch((e) => console.error(e));
      if (story.standardUrl)
        await this.uploadsService
          .deleteFile(story.standardUrl)
          .catch((e) => console.error(e));
      if (story.thumbnailUrl)
        await this.uploadsService
          .deleteFile(story.thumbnailUrl)
          .catch((e) => console.error(e));

      await this.prisma.story.delete({
        where: { id: story.id },
      });
    }
  }

  /**
   * Record a story view. Idempotent — returns existing view if already viewed.
   * @param id - The story ID
   * @param profileId - The viewer's user ID
   * @returns The story view record
   */
  async view(id: string, profileId: string): Promise<StoryView> {
    const existingView = await this.prisma.storyView.findUnique({
      where: {
        storyId_viewerId: {
          storyId: id,
          viewerId: profileId,
        },
      },
    });

    if (existingView) return existingView;

    const newView = await this.prisma.storyView.create({
      data: {
        storyId: id,
        viewerId: profileId,
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
        viewer: { include: { user: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return views.map((v) => ({ ...v.viewer.user, profile: v.viewer })) as any;
  }

  /**
   * Add or update a reaction on a story. Upserts by storyId+profileId.
   * @param storyId - The story ID
   * @param profileId - The reacting user's ID
   * @param reaction - The emoji/reaction string
   */
  async addReaction(
    storyId: string,
    profileId: string,
    reaction: string,
  ): Promise<StoryReaction> {
    const existing = await this.prisma.storyReaction.findUnique({
      where: {
        storyId_profileId: {
          storyId,
          profileId,
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
        profileId,
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
        profile: { include: { user: true } },
      },
    });

    return reactions as unknown as StoryReactionWithUser[];
  }

  /**
   * Job to physically delete expired stories every hour to free up database space.
   * Executed via BullMQ.
   */
  async cleanupExpiredStories() {
    try {
      const expiredStories = await this.prisma.story.findMany({
        where: {
          expiresAt: { lt: new Date() },
          highlightStories: { none: {} },
        },
      });

      for (const story of expiredStories) {
        if (story.url)
          await this.uploadsService
            .deleteFile(story.url)
            .catch((e) => console.error(e));
        if (story.standardUrl)
          await this.uploadsService
            .deleteFile(story.standardUrl)
            .catch((e) => console.error(e));
        if (story.thumbnailUrl)
          await this.uploadsService
            .deleteFile(story.thumbnailUrl)
            .catch((e) => console.error(e));
      }

      const deleted = await this.prisma.story.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
          highlightStories: { none: {} },
        },
      });
      if (deleted.count > 0) {
        this.logger.log(`Cleaned up ${deleted.count} expired stories.`);
      }
    } catch (error) {
      this.logger.error('Failed to clean up expired stories', error);
    }
  }

  @OnEvent('user.hard_deleted')
  async handleUserDeleted(payload: { profileId: string }) {
    const userStories = await this.prisma.story.findMany({
      where: { profileId: payload.profileId },
    });

    const mediaUrls = new Set<string>();
    for (const story of userStories) {
      if (story.url) mediaUrls.add(story.url);
      if (story.thumbnailUrl) mediaUrls.add(story.thumbnailUrl);
    }

    if (mediaUrls.size > 0) {
      this.logger.log(
        `Emitting media.delete_batch for ${mediaUrls.size} files...`,
      );
      this.eventEmitter.emit('media.delete_batch', {
        mediaUrls: Array.from(mediaUrls),
      });
    }
  }
}
