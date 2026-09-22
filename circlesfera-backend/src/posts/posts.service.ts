import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContentRating,
  type PostType,
  type Prisma,
  Visibility,
} from '@prisma/client';
import { AIService } from '../ai/ai.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import {
  canMonetize,
  MAX_PPV_PRICE_CENTS,
  MIN_PPV_PRICE_CENTS,
} from '../common/constants/monetization.constants.js';
import {
  createPaginatedResult,
  type PaginationDto,
} from '../common/dto/pagination.dto.js';
import { resolveAudioStartMs } from '../common/utils/audio-clip.util.js';
import { assertVideoUrlDuration } from '../common/utils/media-duration.util.js';
import { resolvePlaceAttachment } from '../common/utils/place.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostDistributionService } from './services/post-distribution.service.js';
import { PostMediaCleanupService } from './services/post-media-cleanup.service.js';
import { PostPaywallService } from './services/post-paywall.service.js';

// Core service for post CRUD, feed generation, pagination, and hashtag/mention extraction.
@Injectable()
export class PostsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
    @Inject(AIService) private readonly aiService: AIService,
    @Inject(SystemSettingsService)
    private readonly systemSettings: SystemSettingsService,
    @Inject(PostPaywallService)
    private readonly postPaywallService: PostPaywallService,
    @Inject(PostDistributionService)
    private readonly postDistributionService: PostDistributionService,
    @Inject(PostMediaCleanupService)
    private readonly postMediaCleanupService: PostMediaCleanupService,
  ) {}

  // Create a new post with media, caption, hashtags, and mentions.
  // Extracts hashtags/mentions from the caption, creates notification for mentioned users,
  // And enqueues AI embedding generation via BullMQ.
  // Param profileId: The author's user ID
  // Param dto: Post creation data (caption, mediaUrl, mediaType, etc.)
  // Returns The created post with user profile and engagement counts
  async create(profileId: string, dto: CreatePostDto) {
    const postingEnabled = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.CONTENT_POSTING_ENABLED,
    );
    if (!postingEnabled) {
      throw new ForbiddenException('CONTENT_POSTING_DISABLED');
    }

    // Extract hashtags and mentions
    // Extract hashtags and mentions with ReDoS-safe, robust patterns
    // Using word boundaries and excluding URLs/emails to avoid false positives
    const hashtags = dto.caption ? dto.caption.match(/(?:^|\s)(#[\w-]+)/g) : [];
    const uniqueTags = hashtags
      ? [...new Set(hashtags.map((tag) => tag.trim().slice(1).toLowerCase()))]
      : [];

    const mentions = dto.caption ? dto.caption.match(/(?:^|\s)(@[\w.]+)/g) : [];
    const uniqueMentions = mentions
      ? [...new Set(mentions.map((m) => m.trim().slice(1)))]
      : [];

    // AI Moderation before creation
    const mediaUrls = dto.media?.map((m) => m.url) || [];
    const moderation = await this.aiService.moderateContent(
      dto.caption || '',
      mediaUrls,
    );

    if (dto.isPremium) {
      const authorProfile = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { accountType: true },
      });
      if (!canMonetize(authorProfile?.accountType)) {
        throw new ForbiddenException(
          'Solo las cuentas Creator o Business pueden publicar contenido premium.',
        );
      }
      if (
        !dto.priceCents ||
        dto.priceCents < MIN_PPV_PRICE_CENTS ||
        dto.priceCents > MAX_PPV_PRICE_CENTS
      ) {
        throw new BadRequestException(
          `El precio del contenido premium debe estar entre €${(MIN_PPV_PRICE_CENTS / 100).toFixed(2)} y €${(MAX_PPV_PRICE_CENTS / 100).toFixed(2)}.`,
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

    const postType = dto.type || 'POST';
    const mediaItems = dto.media ?? [];

    if (postType === 'FRAME') {
      if (mediaItems.length === 0) {
        throw new BadRequestException('FRAME_MEDIA_REQUIRED');
      }
      const nonVideo = mediaItems.filter(
        (m) => (m.type || 'image').toLowerCase() !== 'video',
      );
      if (nonVideo.length > 0) {
        throw new BadRequestException('FRAME_VIDEO_ONLY');
      }
      // Single-clip product surface — validate the primary video.
      await assertVideoUrlDuration('FRAME', mediaItems[0].url);
    } else {
      for (const item of mediaItems) {
        if ((item.type || '').toLowerCase() === 'video') {
          await assertVideoUrlDuration('POST', item.url);
        }
      }
    }

    if (moderation.flagged) {
      throw new BadRequestException(
        'El contenido infringe las normas de la comunidad y ha sido bloqueado.',
      );
    }

    const scheduledAt =
      dto.scheduledAt && new Date(dto.scheduledAt) > new Date()
        ? new Date(dto.scheduledAt)
        : undefined;

    const createdPost = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const post = await tx.post.create({
          data: {
            profileId,
            caption: dto.caption,
            type: postType,
            location: placeAttachment.location,
            placeId: placeAttachment.placeId,
            hideLikes: dto.hideLikes,
            turnOffComments: dto.turnOffComments,
            audioId: dto.audioId,
            audioStartMs,
            contentRating: dto.contentRating || ContentRating.GENERAL,
            visibility: dto.visibility || Visibility.PUBLIC,
            isPremium: dto.isPremium || false,
            priceCents: dto.priceCents || 0,
            scheduledAt: scheduledAt ?? null,
            scheduledStatus: scheduledAt ? 'SCHEDULED' : 'PUBLISHED',
            tags:
              dto.tags && dto.tags.length > 0
                ? {
                    create: dto.tags.map((t) => ({
                      profileId: t.profileId,
                      x: t.x,
                      y: t.y,
                    })),
                  }
                : undefined,
          },
        });

        // Create PostMedia entries
        if (dto.media && dto.media.length > 0) {
          await tx.postMedia.createMany({
            data: dto.media.map((item, index) => ({
              postId: post.id,
              url: item.url,
              standardUrl: item.standardUrl,
              thumbnailUrl: item.thumbnailUrl,
              type: item.type || 'image',
              filter: item.filter,
              altText: item.altText,
              order: index,
            })),
          });
        }

        // Process hashtags inside the transaction (sorted to avoid deadlocks)
        if (uniqueTags.length > 0) {
          const sortedTags = [...uniqueTags].sort();
          for (const tag of sortedTags) {
            const hashtag = await tx.hashtag.upsert({
              where: { tag },
              create: { tag, postCount: 1 },
              update: { postCount: { increment: 1 } },
            });
            await tx.postHashtag.create({
              data: {
                postId: post.id,
                hashtagId: hashtag.id,
              },
            });
          }
        }

        return post;
      },
    );

    // Fetch complete post with relations before returning
    const post = await this.prisma.post.findUniqueOrThrow({
      where: { id: createdPost.id },
      include: {
        media: true,
        hashtags: { include: { hashtag: true } },
        tags: true,
        audio: true,
        place: true,
        profile: { include: { user: true } },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    // Defer fan-out/notifications until the maintenance worker publishes
    if (scheduledAt) {
      return post;
    }

    await this.postDistributionService.dispatchPostPublished(post, {
      caption: dto.caption,
      uniqueMentions,
    });

    return post;
  }

  // Retrieve posts filtered by hashtag with pagination.
  // Param tag: The hashtag to filter by (without #)
  // Param pagination: Page and limit parameters
  // Returns Paginated list of posts containing the given hashtag
  async getByTag(tag: string, pagination: PaginationDto) {
    const { page = 1, limit = 10, cursor } = pagination;
    const skip = cursor ? 1 : (page - 1) * limit;

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          hashtags: {
            some: {
              hashtag: {
                tag: tag.toLowerCase(),
              },
            },
          },
        },
        skip,
        take: limit,
        ...(cursor && { cursor: { id: cursor } }),
        orderBy: { createdAt: 'desc' },
        include: {
          profile: {
            include: {
              user: true,
            },
          },
          media: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
      }),
      this.prisma.post.count({
        where: {
          hashtags: {
            some: {
              hashtag: {
                tag: tag.toLowerCase(),
              },
            },
          },
        },
      }),
    ]);

    return createPaginatedResult(
      posts.map((post) => this.injectIsLiked(post, undefined)),
      total,
      page,
      limit,
      posts.length > 0 ? posts[posts.length - 1].id : undefined,
    );
  }

  // List all posts with optional sorting (latest/trending) and pagination.
  // Enriches each post with `isLiked` and `isBookmarked` flags for the current user.
  // Param pagination: Page and limit parameters
  // Param sort: Sort order: 'latest' (default) or 'trending' (by like count)
  // Param currentProfileId: Optional current user for engagement flags
  async findAll(
    pagination: PaginationDto,
    sort: 'latest' | 'trending' = 'latest',
    currentProfileId?: string,
  ) {
    const { page = 1, limit = 10, cursor } = pagination;
    const skip = cursor ? 1 : (page - 1) * limit;

    const orderBy: Prisma.PostOrderByWithRelationInput =
      sort === 'trending'
        ? { likes: { _count: 'desc' } }
        : { createdAt: 'desc' };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          type: 'POST',
          ...this.getGlobalVisibilityFilter(currentProfileId),
        },
        skip,
        take: limit,
        ...(cursor && { cursor: { id: cursor } }),
        orderBy,
        include: {
          profile: {
            include: {
              user: true,
            },
          },
          media: true,
          audio: true,
          place: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: currentProfileId
            ? { where: { profileId: currentProfileId }, take: 1 }
            : false,
        },
      }),
      this.prisma.post.count({
        where: {
          type: 'POST',
          ...this.getGlobalVisibilityFilter(currentProfileId),
        },
      }),
    ]);

    const formattedPosts = posts.map((post) => {
      const { likes, ...rest } = post;
      const isLiked =
        currentProfileId && Array.isArray(likes) ? likes.length > 0 : false;
      return {
        ...rest,
        isLiked,
      };
    });

    const processedPosts = await this.postPaywallService.applyPaywall(
      formattedPosts,
      currentProfileId,
    );
    return createPaginatedResult(
      processedPosts,
      total,
      page,
      limit,
      processedPosts.length > 0
        ? processedPosts[processedPosts.length - 1].id
        : undefined,
    );
  }

  // Retrieve a video-only feed (Frames/Reels) with pagination.
  // Param pagination: Page and limit parameters
  // Param currentProfileId: Optional current user for engagement flags
  async getFramesFeed(pagination: PaginationDto, currentProfileId?: string) {
    const { page = 1, limit = 10, cursor } = pagination;
    const skip = cursor ? 1 : (page - 1) * limit;

    // Frames are usually randomized or trending, for now we will just show latest frames globally
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          type: 'FRAME',
          ...this.getGlobalVisibilityFilter(currentProfileId),
        },
        skip,
        take: limit,
        ...(cursor && { cursor: { id: cursor } }),
        orderBy: { createdAt: 'desc' },
        include: {
          profile: {
            include: {
              user: true,
            },
          },
          media: true,
          audio: true,
          place: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: currentProfileId
            ? { where: { profileId: currentProfileId }, take: 1 }
            : false,
        },
      }),
      this.prisma.post.count({
        where: {
          type: 'FRAME',
          ...this.getGlobalVisibilityFilter(currentProfileId),
        },
      }),
    ]);

    const formattedPosts = posts.map((post) => {
      const { likes, ...rest } = post;
      const isLiked =
        currentProfileId && Array.isArray(likes) ? likes.length > 0 : false;
      return {
        ...rest,
        isLiked,
      };
    });

    const processedPosts = await this.postPaywallService.applyPaywall(
      formattedPosts,
      currentProfileId,
    );

    return createPaginatedResult(processedPosts, total, page, limit);
  }

  // Retrieve a single post by ID with full relations and engagement flags.
  // Param id: The post's unique identifier
  // Param currentProfileId: Optional current user for isLiked/isBookmarked
  // Throws NotFoundException if the post does not exist
  async findOne(id: string, currentProfileId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        profile: {
          include: {
            user: { include: { settings: true } },
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        likes: currentProfileId
          ? { where: { profileId: currentProfileId }, take: 1 }
          : false,
        media: true,
        audio: true,
        place: true,
        poll: { select: { id: true } },
        qnaBox: { select: { id: true } },
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Authorization: Check if the post is private
    // Authorization: Check if the post belongs to a private account
    const isProfilePrivate =
      post.profile.user?.settings?.privacyLevel === Visibility.PRIVATE;
    if (isProfilePrivate && post.profileId !== currentProfileId) {
      const follow = currentProfileId
        ? await this.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: currentProfileId,
                followingId: post.profileId,
              },
            },
          })
        : null;

      if (follow?.status !== 'ACCEPTED') {
        throw new ForbiddenException('This account is private');
      }
    }

    // Author check is already done above for private profiles.
    // Post-level visibility check
    if (
      post.visibility === Visibility.PRIVATE &&
      post.profileId !== currentProfileId
    ) {
      throw new ForbiddenException('This post is private');
    }

    if (
      post.visibility === Visibility.FOLLOWERS &&
      post.profileId !== currentProfileId
    ) {
      const isFollower = currentProfileId
        ? await this.isFollowing(currentProfileId, post.profileId)
        : false;

      if (!isFollower) {
        throw new ForbiddenException('This post is for followers only');
      }
    }

    // Track view asynchronously (don't block the response)
    this.analyticsService
      .trackPostView(post.id, currentProfileId)
      .catch((err) => {
        console.error('Failed to track view in findOne:', err);
      });

    return this.injectIsLiked(post, currentProfileId) as Record<
      string,
      unknown
    >;
  }

  // Retrieve posts by a specific user's username with optional type filter.
  // Param username: The profile username to look up
  // Param pagination: Page and limit parameters
  // Param type: Optional filter by PostType (post, reel, frame)
  // Param currentProfileId: Optional current user for engagement flags
  async findByUser(
    username: string,
    pagination: PaginationDto,
    type?: PostType,
    currentProfileId?: string,
  ) {
    const { page = 1, limit = 10, cursor } = pagination;
    const skip = cursor ? 1 : (page - 1) * limit;

    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      include: { user: { include: { settings: true } } },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
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
        throw new ForbiddenException('This account is private');
      }
    }

    const whereClause: Prisma.PostWhereInput = {
      profileId: profile.id,
      ...this.getUserProfileVisibilityFilter(profile.id, currentProfileId),
    };

    if (type) {
      whereClause.type = type;
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: whereClause,
        skip,
        take: limit,
        ...(cursor && { cursor: { id: cursor } }),
        orderBy: { createdAt: 'desc' },
        include: {
          profile: {
            include: {
              user: true,
            },
          },
          media: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: currentProfileId
            ? { where: { profileId: currentProfileId }, take: 1 }
            : false,
        },
      }),
      this.prisma.post.count({ where: whereClause }),
    ]);

    const postsWithLikes = posts.map((post) =>
      this.injectIsLiked(post, currentProfileId),
    );
    const processedPosts = await this.postPaywallService.applyPaywall(
      postsWithLikes,
      currentProfileId,
    );

    return createPaginatedResult(
      processedPosts,
      total,
      page,
      limit,
      processedPosts.length > 0
        ? processedPosts[processedPosts.length - 1].id
        : undefined,
    );
  }

  // Retrieve posts where a user has been tagged/mentioned.
  // Param username: The tagged user's username
  // Param pagination: Page and limit parameters
  async getTaggedPosts(username: string, pagination: PaginationDto) {
    const { page = 1, limit = 10, cursor } = pagination;
    const skip = cursor ? 1 : (page - 1) * limit;

    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          tags: {
            some: {
              profileId: profile.id,
            },
          },
        },
        skip,
        take: limit,
        ...(cursor && { cursor: { id: cursor } }),
        orderBy: { createdAt: 'desc' },
        include: {
          profile: {
            include: {
              user: true,
            },
          },
          media: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
      }),
      this.prisma.post.count({
        where: {
          tags: {
            some: {
              profileId: profile.id,
            },
          },
        },
      }),
    ]);

    return createPaginatedResult(
      posts.map((post) => this.injectIsLiked(post, undefined)),
      total,
      page,
      limit,
      posts.length > 0 ? posts[posts.length - 1].id : undefined,
    );
  }

  // GetFeed and getDiscoveryFeed have been migrated to the FeedModule (feed.service.ts)
  // As part of the new Hybrid AI Algorithm architecture.
  // Please use FeedService for feed generation.

  // Update a post's caption and media. Only the author can update.
  // Param id: The post ID
  // Param profileId: The requesting user's ID (must be the author)
  // Param dto: Updated post data
  // Throws NotFoundException if post not found
  // Throws ForbiddenException if user is not the author
  async update(id: string, dto: UpdatePostDto) {
    // The OwnershipGuard ensures the post exists and belongs to the user

    return this.prisma.post.update({
      where: { id },
      data: {
        caption: dto.caption,
        visibility: dto.visibility as Visibility,
      },
      include: {
        profile: {
          include: {
            user: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        media: true,
      },
    });
  }

  // Delete a post. Only the author can delete their own posts.
  // Param id: The post ID
  // Param profileId: The requesting user's ID (must be the author)
  // Throws NotFoundException if post not found
  // Throws ForbiddenException if user is not the author
  async remove(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { media: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Ownership check is handled by OwnershipGuard at the controller level
    await this.prisma.post.delete({ where: { id } });
    await this.postMediaCleanupService.cleanupMedia(post.media);
  }

  // Admin-only post deletion (bypasses ownership check).
  // Param id: The post ID to remove
  // Throws NotFoundException if post not found
  async adminRemove(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.prisma.post.delete({ where: { id } });
    await this.postMediaCleanupService.cleanupMedia(post.media);
  }

  // Returns a Prisma filter for global/discovery feeds.
  // Shows only PUBLIC posts from non-private profiles, plus user's own posts.
  private getGlobalVisibilityFilter(
    currentProfileId?: string,
  ): Prisma.PostWhereInput {
    const baseFilter: Prisma.PostWhereInput = {
      visibility: Visibility.PUBLIC,
      moderationStatus: 'VISIBLE',
      profile: {
        user: { settings: { is: { privacyLevel: Visibility.PUBLIC } } },
      },
    };

    if (!currentProfileId) return baseFilter;

    return {
      OR: [baseFilter, { profileId: currentProfileId }],
    };
  }

  // Returns a Prisma filter for a specific user's profile.
  // Adjusts visibility based on whether the viewer is the author or a follower.
  private getUserProfileVisibilityFilter(
    authorId: string,
    currentProfileId?: string,
  ): Prisma.PostWhereInput {
    if (authorId === currentProfileId) return {}; // Author sees everything

    const publicFilter: Prisma.PostWhereInput = {
      visibility: Visibility.PUBLIC,
    };

    // If not logged in, only see public
    if (!currentProfileId) return publicFilter;

    return {
      moderationStatus: { in: ['VISIBLE', 'FLAGGED'] }, // Still show flagged but not hidden
      OR: [
        publicFilter,
        {
          visibility: Visibility.FOLLOWERS,
          profile: {
            followers: {
              some: {
                followerId: currentProfileId,
                status: 'ACCEPTED',
              },
            },
          },
        },
      ],
    };
  }

  private injectIsLiked<T extends Record<string, any>>(
    post: T,
    currentProfileId?: string,
  ): T & { isLiked: boolean } {
    const { likes, ...rest } = post as T & { likes?: unknown[] };
    const isLiked =
      currentProfileId && Array.isArray(likes) ? likes.length > 0 : false;

    return {
      ...(rest as T),
      isLiked,
    };
  }

  private async isFollowing(
    followerId: string,
    followingId: string,
  ): Promise<boolean> {
    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });
    return follow?.status === 'ACCEPTED';
  }
}
