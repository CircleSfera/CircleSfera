/** Trigger re-index */
import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  $Enums,
  ContentRating,
  type PostType,
  type Prisma,
  Visibility,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const NotificationType = $Enums.NotificationType;

import type { Queue } from 'bullmq';
import { AnalyticsService } from '../analytics/analytics.service.js';
import {
  createPaginatedResult,
  type PaginationDto,
} from '../common/dto/pagination.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { CreatePostDto } from './dto/create-post.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { UpdatePostDto } from './dto/update-post.dto.js';

/**
 * Core service for post CRUD, feed generation, pagination, and hashtag/mention extraction.
 * Integrates with BullMQ for async AI embedding and NotificationsService for mention alerts.
 */
@Injectable()
export class PostsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @InjectQueue('ai-processing') private readonly aiQueue: Queue,
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
  ) {}

  /**
   * Create a new post with media, caption, hashtags, and mentions.
   * Extracts hashtags/mentions from the caption, creates notification for mentioned users,
   * and enqueues AI embedding generation via BullMQ.
   * @param userId - The author's user ID
   * @param dto - Post creation data (caption, mediaUrl, mediaType, etc.)
   * @returns The created post with user profile and engagement counts
   */
  async create(userId: string, dto: CreatePostDto) {
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

    const post = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const post = await tx.post.create({
          data: {
            userId,
            caption: dto.caption,
            type: dto.type || 'POST',
            location: dto.location,
            hideLikes: dto.hideLikes,
            turnOffComments: dto.turnOffComments,
            audioId: dto.audioId,
            contentRating: dto.contentRating || ContentRating.GENERAL,
            visibility: dto.visibility || Visibility.PUBLIC,
            tags:
              dto.tags && dto.tags.length > 0
                ? {
                    create: dto.tags.map((t) => ({
                      userId: t.userId,
                      x: t.x,
                      y: t.y,
                    })),
                  }
                : undefined,
          },
          include: {
            user: {
              include: {
                profile: true,
              },
            },
            media: true, // Include the new relation
            tags: true, // Include tags
            _count: {
              select: {
                likes: true,
                comments: true,
              },
            },
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
        if (uniqueTags.length > 0) {
          for (const tag of uniqueTags) {
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

        // Fetch complete post with relations before returning
        return tx.post.findUniqueOrThrow({
          where: { id: post.id },
          include: {
            media: true,
            hashtags: { include: { hashtag: true } },
            user: { include: { profile: true } },
          },
        });
      },
    );

    // Generate and store embedding for the post in the background
    await this.aiQueue.add('generate-embedding', {
      postId: post.id,
      text: dto.caption || '',
    });

    // Moderate content in the background
    await this.aiQueue.add('moderate-content', {
      targetId: post.id,
      text: dto.caption || '',
      targetType: 'POST',
      mediaUrls: post.media.map((m) => m.thumbnailUrl || m.url),
    });

    // Generate alt-text for accessibility in the background
    await this.aiQueue.add('generate-alt-text', {
      postId: post.id,
    });

    // Handle Mentions (outside transaction to avoid blocking)
    if (uniqueMentions.length > 0) {
      // Find users mentioned
      const profiles = await this.prisma.profile.findMany({
        where: {
          username: { in: uniqueMentions },
          userId: { not: userId }, // Don't notify self
        },
        select: { userId: true },
      });

      // Create notifications
      await Promise.all(
        profiles.map((profile) =>
          this.notificationsService.create({
            recipientId: profile.userId,
            senderId: userId,
            type: NotificationType.MENTION,
            content: `mentioned you in a post`,
          }),
        ),
      );
    }

    return post;
  }

  /**
   * Retrieve posts filtered by hashtag with pagination.
   * @param tag - The hashtag to filter by (without #)
   * @param pagination - Page and limit parameters
   * @returns Paginated list of posts containing the given hashtag
   */
  async getByTag(tag: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

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
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            include: {
              profile: true,
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
    );
  }

  /**
   * List all posts with optional sorting (latest/trending) and pagination.
   * Enriches each post with `isLiked` and `isBookmarked` flags for the current user.
   * @param pagination - Page and limit parameters
   * @param sort - Sort order: 'latest' (default) or 'trending' (by like count)
   * @param currentUserId - Optional current user for engagement flags
   */
  async findAll(
    pagination: PaginationDto,
    sort: 'latest' | 'trending' = 'latest',
    currentUserId?: string,
  ) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const orderBy: Prisma.PostOrderByWithRelationInput =
      sort === 'trending'
        ? { likes: { _count: 'desc' } }
        : { createdAt: 'desc' };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          type: 'POST',
          ...this.getGlobalVisibilityFilter(currentUserId),
        },
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          media: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: currentUserId
            ? { where: { userId: currentUserId }, take: 1 }
            : false,
        },
      }),
      this.prisma.post.count({
        where: {
          type: 'POST',
          ...this.getGlobalVisibilityFilter(currentUserId),
        },
      }),
    ]);

    const formattedPosts = posts.map((post) => {
      const { likes, ...rest } = post;
      const isLiked =
        currentUserId && Array.isArray(likes) ? likes.length > 0 : false;
      return {
        ...rest,
        isLiked,
      };
    });

    const processedPosts = await this.applyPaywall(
      formattedPosts,
      currentUserId,
    );
    return createPaginatedResult(processedPosts, total, page, limit);
  }

  /**
   * Retrieve a video-only feed (Frames/Reels) with pagination.
   * @param pagination - Page and limit parameters
   * @param currentUserId - Optional current user for engagement flags
   */
  async getFramesFeed(pagination: PaginationDto, currentUserId?: string) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    // Frames are usually randomized or trending, for now we will just show latest frames globally
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          type: 'FRAME',
          ...this.getGlobalVisibilityFilter(currentUserId),
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          media: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: currentUserId
            ? { where: { userId: currentUserId }, take: 1 }
            : false,
        },
      }),
      this.prisma.post.count({
        where: {
          type: 'FRAME',
          ...this.getGlobalVisibilityFilter(currentUserId),
        },
      }),
    ]);

    const formattedPosts = posts.map((post) => {
      const { likes, ...rest } = post;
      const isLiked =
        currentUserId && Array.isArray(likes) ? likes.length > 0 : false;
      return {
        ...rest,
        isLiked,
      };
    });

    return createPaginatedResult(formattedPosts, total, page, limit);
  }

  /**
   * Retrieve a single post by ID with full relations and engagement flags.
   * @param id - The post's unique identifier
   * @param currentUserId - Optional current user for isLiked/isBookmarked
   * @throws NotFoundException if the post does not exist
   */
  async findOne(id: string, currentUserId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            profile: true,
            settings: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        likes: currentUserId
          ? { where: { userId: currentUserId }, take: 1 }
          : false,
        media: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Authorization: Check if the post is private
    // Authorization: Check if the post belongs to a private account
    const isProfilePrivate =
      post.user.settings?.privacyLevel === Visibility.PRIVATE;
    if (isProfilePrivate && post.userId !== currentUserId) {
      const follow = currentUserId
        ? await this.prisma.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: currentUserId,
                followingId: post.userId,
              },
            },
          })
        : null;

      if (!follow || follow.status !== 'ACCEPTED') {
        throw new ForbiddenException('This account is private');
      }
    }

    // Author check is already done above for private profiles.
    // Post-level visibility check
    if (
      post.visibility === Visibility.PRIVATE &&
      post.userId !== currentUserId
    ) {
      throw new ForbiddenException('This post is private');
    }

    if (
      post.visibility === Visibility.FOLLOWERS &&
      post.userId !== currentUserId
    ) {
      const isFollower = currentUserId
        ? await this.isFollowing(currentUserId, post.userId)
        : false;

      if (!isFollower) {
        throw new ForbiddenException('This post is for followers only');
      }
    }

    // Track view asynchronously (don't block the response)
    this.analyticsService.trackPostView(post.id, currentUserId).catch((err) => {
      console.error('Failed to track view in findOne:', err);
    });

    return this.injectIsLiked(post, currentUserId) as Record<string, unknown>;
  }

  /**
   * Retrieve posts by a specific user's username with optional type filter.
   * @param username - The profile username to look up
   * @param pagination - Page and limit parameters
   * @param type - Optional filter by PostType (post, reel, frame)
   * @param currentUserId - Optional current user for engagement flags
   */
  async findByUser(
    username: string,
    pagination: PaginationDto,
    type?: PostType,
    currentUserId?: string,
  ) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const profile = await this.prisma.profile.findUnique({
      where: { username },
      include: { user: { include: { settings: true } } },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
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

      if (!follow || follow.status !== 'ACCEPTED') {
        throw new ForbiddenException('This account is private');
      }
    }

    const whereClause: Prisma.PostWhereInput = {
      userId: profile.userId,
      ...this.getUserProfileVisibilityFilter(profile.userId, currentUserId),
    };

    if (type) {
      whereClause.type = type;
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            include: {
              profile: true,
            },
          },
          media: true,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          likes: currentUserId
            ? { where: { userId: currentUserId }, take: 1 }
            : false,
        },
      }),
      this.prisma.post.count({ where: whereClause }),
    ]);

    const postsWithLikes = posts.map((post) =>
      this.injectIsLiked(post, currentUserId),
    );
    const processedPosts = await this.applyPaywall(
      postsWithLikes,
      currentUserId,
    );

    return createPaginatedResult(processedPosts, total, page, limit);
  }

  /**
   * Retrieve posts where a user has been tagged/mentioned.
   * @param username - The tagged user's username
   * @param pagination - Page and limit parameters
   */
  async getTaggedPosts(username: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const profile = await this.prisma.profile.findUnique({
      where: { username },
    });

    if (!profile) {
      throw new NotFoundException('User not found');
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          tags: {
            some: {
              userId: profile.userId,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            include: {
              profile: true,
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
              userId: profile.userId,
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
    );
  }

  /**
   * getFeed and getDiscoveryFeed have been migrated to the FeedModule (feed.service.ts)
   * as part of the new Hybrid AI Algorithm architecture.
   * Please use FeedService for feed generation.
   */

  /**
   * Update a post's caption and media. Only the author can update.
   * @param id - The post ID
   * @param userId - The requesting user's ID (must be the author)
   * @param dto - Updated post data
   * @throws NotFoundException if post not found
   * @throws ForbiddenException if user is not the author
   */
  async update(id: string, userId: string, dto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({ where: { id } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.userId !== userId) {
      throw new ForbiddenException('You can only update your own posts');
    }

    return this.prisma.post.update({
      where: { id },
      data: {
        caption: dto.caption,
        visibility: dto.visibility as Visibility,
      },
      include: {
        user: {
          include: {
            profile: true,
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

  /**
   * Delete a post. Only the author can delete their own posts.
   * @param id - The post ID
   * @param userId - The requesting user's ID (must be the author)
   * @throws NotFoundException if post not found
   * @throws ForbiddenException if user is not the author
   */
  async remove(id: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.userId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    await this.prisma.post.delete({ where: { id } });
  }

  /**
   * Admin-only post deletion (bypasses ownership check).
   * @param id - The post ID to remove
   * @throws NotFoundException if post not found
   */
  async adminRemove(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    await this.prisma.post.delete({ where: { id } });
  }

  /**
   * Returns a Prisma filter for global/discovery feeds.
   * Shows only PUBLIC posts from non-private profiles, plus user's own posts.
   */
  private getGlobalVisibilityFilter(
    currentUserId?: string,
  ): Prisma.PostWhereInput {
    const baseFilter: Prisma.PostWhereInput = {
      visibility: Visibility.PUBLIC,
      moderationStatus: 'VISIBLE',
      user: { settings: { privacyLevel: Visibility.PUBLIC } },
    };

    if (!currentUserId) return baseFilter;

    return {
      OR: [baseFilter, { userId: currentUserId }],
    };
  }

  /**
   * Returns a Prisma filter for a specific user's profile.
   * Adjusts visibility based on whether the viewer is the author or a follower.
   */
  private getUserProfileVisibilityFilter(
    authorId: string,
    currentUserId?: string,
  ): Prisma.PostWhereInput {
    if (authorId === currentUserId) return {}; // Author sees everything

    const publicFilter: Prisma.PostWhereInput = {
      visibility: Visibility.PUBLIC,
    };

    // If not logged in, only see public
    if (!currentUserId) return publicFilter;

    return {
      moderationStatus: { in: ['VISIBLE', 'FLAGGED'] }, // Still show flagged but not hidden
      OR: [
        publicFilter,
        {
          visibility: Visibility.FOLLOWERS,
          user: {
            followers: {
              some: {
                followerId: currentUserId,
                status: 'ACCEPTED',
              },
            },
          },
        },
      ],
    };
  }

  private injectIsLiked(post: Record<string, any>, currentUserId?: string) {
    const { likes, ...rest } = post as { likes?: any[] } & Record<string, any>;
    const isLiked =
      currentUserId && Array.isArray(likes) ? likes.length > 0 : false;

    return {
      ...(rest as Record<string, unknown>),
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

  /**
   * Applies the paywall to a list of posts, blurring media if the user hasn't paid or subscribed.
   */
  private async applyPaywall(posts: any[], currentUserId?: string) {
    if (!posts || posts.length === 0) return posts;

    // If guest, blur all premium posts
    if (!currentUserId) {
      return posts.map((post) => {
        if (post.isPremium) {
          return {
            ...post,
            isLocked: true,
            media: post.media?.map((m: any) => ({
              ...m,
              url: '',
              standardUrl: '',
            })),
          };
        }
        return post;
      });
    }

    // Fetch user's active subscriptions
    const subscriptions = await this.prisma.creatorSubscription.findMany({
      where: {
        subscriberId: currentUserId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      select: { creatorId: true },
    });
    const subscribedCreatorIds = new Set(subscriptions.map((s) => s.creatorId));

    // Fetch user's unlocked posts
    const unlocks = await this.prisma.transaction.findMany({
      where: {
        senderId: currentUserId,
        type: 'POST_UNLOCK',
        status: 'COMPLETED',
      },
      select: { postId: true },
    });
    const unlockedPostIds = new Set(unlocks.map((u) => u.postId));

    return posts.map((post) => {
      if (post.isPremium && post.userId !== currentUserId) {
        const isSubscribed = subscribedCreatorIds.has(post.userId);
        const isUnlocked = unlockedPostIds.has(post.id);

        if (!isSubscribed && !isUnlocked) {
          return {
            ...post,
            isLocked: true,
            media: post.media?.map((m: any) => ({
              ...m,
              url: '',
              standardUrl: '',
            })),
          };
        }
      }
      return post;
    });
  }
}
