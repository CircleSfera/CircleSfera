import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  type Prisma,
  type StoryReaction,
  type StoryView,
  Visibility,
} from '@prisma/client';
import { Queue } from 'bullmq';
import {
  canMonetize,
  MAX_PPV_PRICE_CENTS,
  MIN_PPV_PRICE_CENTS,
} from '../common/constants/monetization.constants.js';
import {
  decodeKeysetCursor,
  type KeysetPage,
  keysetBeforeDesc,
  toKeysetPage,
} from '../common/pagination/keyset.util.js';
import { resolveAudioStartMs } from '../common/utils/audio-clip.util.js';
import { assertVideoUrlDuration } from '../common/utils/media-duration.util.js';
import {
  buildMediaCreateInput,
  resolveMediaFields,
} from '../common/utils/media-lifecycle.util.js';
import { resolvePlaceAttachment } from '../common/utils/place.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { CreateStoryDto } from './dto/create-story.dto.js';

// Public-safe fields for a story viewer/reactor. Deliberately excludes the
// rest of the User record (password hash, tokens, email, IP hashes, ...) —
// these lists are shown to other users (the story owner), not the viewer
// themselves.
const storyViewerSelect = {
  id: true,
  username: true,
  fullName: true,
  avatar: true,
  standardUrl: true,
  thumbnailUrl: true,
  verificationLevel: true,
  accountType: true,
} satisfies Prisma.ProfileSelect;

type StoryViewerRow = Prisma.ProfileGetPayload<{
  select: typeof storyViewerSelect;
}>;

export interface SafeStoryViewer {
  id: string;
  verificationLevel: StoryViewerRow['verificationLevel'];
  accountType: StoryViewerRow['accountType'];
  profile: {
    id: string;
    username: string;
    fullName: string | null;
    avatar: string | null;
    standardUrl: string | null;
    thumbnailUrl: string | null;
  };
}

function toSafeStoryViewer(row: StoryViewerRow): SafeStoryViewer {
  const { verificationLevel, accountType, ...profile } = row;
  return {
    id: row.id,
    verificationLevel,
    accountType,
    profile,
  };
}

// A story reaction with the reactor's public-safe profile — never the raw
// User record (password hash, tokens, email, IP hashes, ...). Unlike
// getViews, this list is not owner-only: every viewer needs it to know
// their own reaction state (see StoryViewer.tsx's "did I already like
// this" heart-fill check), so the fix here is data minimization only, not
// an auth restriction.
export type SafeStoryReaction = StoryReaction & {
  profile: StoryViewerRow;
};

// Service for ephemeral stories (24h expiry), story views, and reactions.
// Supports close-friends-only visibility and tracks unique view counts.
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

  // Create a new ephemeral story with a 24-hour expiry.
  // Param profileId: The author's user ID
  // Param dto: Story data (url, mediaType, isCloseFriendsOnly, audioId)
  async create(profileId: string, dto: CreateStoryDto) {
    const postingEnabled = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.CONTENT_POSTING_ENABLED,
    );
    if (!postingEnabled) {
      throw new ForbiddenException('CONTENT_POSTING_DISABLED');
    }

    if (dto.isPremium) {
      const authorProfile = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { accountType: true },
      });
      if (!canMonetize(authorProfile?.accountType)) {
        throw new ForbiddenException(
          'Solo las cuentas Creator o Business pueden publicar historias premium.',
        );
      }
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

    let audioStartMs = 0;
    if (dto.audioId) {
      const audio = await this.prisma.audio.findUnique({
        where: { id: dto.audioId },
        select: { id: true, duration: true },
      });
      if (!audio) {
        throw new BadRequestException('AUDIO_NOT_FOUND');
      }
      audioStartMs = resolveAudioStartMs({
        audioId: dto.audioId,
        audioStartMs: dto.audioStartMs,
        trackDurationSec: audio.duration,
      });
    }

    const placeAttachment = await resolvePlaceAttachment(this.prisma, {
      placeId: dto.placeId,
      place: dto.place,
      location: dto.location,
    });

    const mediaType = (dto.mediaType || 'image').toLowerCase();
    if (mediaType === 'video') {
      await assertVideoUrlDuration('STORY', dto.url);
    }

    const scheduledAt =
      dto.scheduledAt && new Date(dto.scheduledAt) > new Date()
        ? new Date(dto.scheduledAt)
        : undefined;

    // Created separately (not nested) because mixing raw FK scalars
    // (profileId, audioId, placeId) with a nested `media: { create }`
    // relation isn't a valid Prisma input shape — Prisma requires either
    // all-relations or all-raw-FKs in a single create call.
    const media = await this.prisma.media.create({
      data: buildMediaCreateInput({
        type: dto.mediaType || 'image',
        url: dto.url,
        standardUrl: dto.standardUrl,
        thumbnailUrl: dto.thumbnailUrl,
      }),
    });

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
        audioStartMs,
        location: placeAttachment.location,
        placeId: placeAttachment.placeId,
        scheduledAt: scheduledAt ?? null,
        scheduledStatus: scheduledAt ? 'SCHEDULED' : 'PUBLISHED',
        mediaId: media.id,
      },
      include: {
        profile: { include: { user: true } },
        audio: true,
        place: true,
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

  // Retrieve all active (non-expired) stories, optionally filtered to followed users.
  // Respects close-friends visibility permissions.
  // Param profileId: Optional current user ID for personalized filtering
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
        audio: true,
        place: true,
        poll: { select: { id: true } },
        qnaBox: { select: { id: true } },
        media: true,
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
      const { views, media, ...storyData } = s;
      return {
        ...storyData,
        url: media?.url ?? storyData.url,
        standardUrl: media?.standardUrl ?? storyData.standardUrl ?? null,
        thumbnailUrl: media?.thumbnailUrl ?? storyData.thumbnailUrl ?? null,
        status: media?.status ?? 'READY',
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

  // Redact media URLs for premium stories the viewer has not unlocked.
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

  // Retrieve active stories by a specific user's username.
  // Param username: The profile username to look up
  // Param currentProfileId: Optional current user for authorization check
  // Returns Array of active stories or empty array if user not found
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
        audio: true,
        place: true,
        media: true,
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
      const { views, media, ...storyData } = s;
      return {
        ...storyData,
        url: media?.url ?? storyData.url,
        standardUrl: media?.standardUrl ?? storyData.standardUrl ?? null,
        thumbnailUrl: media?.thumbnailUrl ?? storyData.thumbnailUrl ?? null,
        status: media?.status ?? 'READY',
        isViewed: currentProfileId ? (views as unknown[]).length > 0 : false,
      };
    });
    return this.applyStoryPremiumLocks(mapped, currentProfileId);
  }

  // Retrieve ALL stories (active and expired) for the current user's archive.
  // Only accessible by the owner.
  // Param profileId: The current user's ID
  async getArchive(profileId: string) {
    const stories = await this.prisma.story.findMany({
      where: {
        profileId,
      },
      include: {
        profile: { include: { user: true } },
        media: true,
        _count: {
          select: { views: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return stories.map(resolveMediaFields);
  }

  // Delete a story. Ownership is enforced by OwnershipGuard at the controller level.
  // Param id: The story ID
  // Throws NotFoundException if story not found
  async delete(id: string): Promise<void> {
    const story = await this.prisma.story.findUnique({
      where: { id },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

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

  // Record a story view. Idempotent — returns existing view if already viewed.
  // Param id: The story ID
  // Param profileId: The viewer's user ID
  // Returns The story view record
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

  // Get viewers of a story with their profiles, newest first. Owner-only
  // (enforced by OwnershipGuard at the controller level) — a view list
  // reveals who watched, which is sensitive the same way read receipts are.
  // Cursor/keyset pagination (DATA-003) — was fully unbounded, stable under
  // concurrent views unlike skip/take.
  // Only public-safe profile fields are selected here, never the raw User
  // record — that would leak auth secrets (password hash, tokens) to the
  // story owner.
  // Param id: The story ID
  // Param cursor: opaque cursor from the previous page's nextCursor
  // Param limit: page size, default 50, capped at 100
  async getViews(
    id: string,
    cursor?: string,
    limit = 50,
  ): Promise<KeysetPage<SafeStoryViewer>> {
    const cappedLimit = Math.min(limit, 100);
    const decoded = cursor ? decodeKeysetCursor(cursor) : null;
    const cursorWhere = decoded ? keysetBeforeDesc(decoded) : {};

    const views = await this.prisma.storyView.findMany({
      where: { storyId: id, ...cursorWhere },
      include: {
        viewer: { select: storyViewerSelect },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: cappedLimit + 1,
    });

    const page = toKeysetPage(views, cappedLimit);
    return {
      ...page,
      data: page.data.map((v) => toSafeStoryViewer(v.viewer)),
    };
  }

  // Add or update a reaction on a story. Upserts by storyId+profileId.
  // Param storyId: The story ID
  // Param profileId: The reacting user's ID
  // Param reaction: The emoji/reaction string
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

  // Get reactions for a story with reactor profiles, newest first.
  // Cursor/keyset pagination (DATA-003) — was fully unbounded, stable under
  // concurrent reactions unlike skip/take.
  // Param storyId: The story ID
  // Param cursor: opaque cursor from the previous page's nextCursor
  // Param limit: page size, default 50, capped at 100
  async getReactions(
    storyId: string,
    cursor?: string,
    limit = 50,
  ): Promise<KeysetPage<SafeStoryReaction>> {
    const cappedLimit = Math.min(limit, 100);
    const decoded = cursor ? decodeKeysetCursor(cursor) : null;
    const cursorWhere = decoded ? keysetBeforeDesc(decoded) : {};

    const reactions = await this.prisma.storyReaction.findMany({
      where: { storyId, ...cursorWhere },
      include: {
        profile: { select: storyViewerSelect },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: cappedLimit + 1,
    });

    return toKeysetPage(reactions, cappedLimit);
  }

  // Job to physically delete expired stories every hour to free up database space.
  // Executed via BullMQ.
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
      return { count: deleted.count };
    } catch (error) {
      this.logger.error('Failed to clean up expired stories', error);
      throw error;
    }
  }

  @OnEvent('user.hard_deleted')
  async handleUserDeleted(payload: {
    profileId?: string;
    profileIds?: string[];
  }) {
    const ids =
      payload.profileIds && payload.profileIds.length > 0
        ? payload.profileIds
        : payload.profileId
          ? [payload.profileId]
          : [];

    if (ids.length === 0) return;

    const userStories = await this.prisma.story.findMany({
      where: { profileId: { in: ids } },
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
