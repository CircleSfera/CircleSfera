import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Service for bookmarking posts. Supports toggle, collection assignment, and paginated retrieval.
 */
@Injectable()
export class BookmarksService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Toggle a bookmark on/off for a post. Optionally assign to a collection.
   * @param userId - The user's ID
   * @param postId - The post to bookmark
   * @param collectionId - Optional collection to add the bookmark to
   * @returns `{ bookmarked: boolean }`
   * @throws NotFoundException if post not found
   */
  async toggle(userId: string, postId: string, collectionId?: string) {
    // Verify post exists
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Check if bookmark exists
    const existingBookmark = await this.prisma.bookmark.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existingBookmark) {
      if (collectionId && existingBookmark.collectionId === collectionId) {
        // If clicking same collection, maybe remove from collection but keep saved?
        // Standard logic: "Save" adds to All. "Save to Collection" adds to Collection.
      } else if (collectionId) {
        // It's bookmarked, but we want to move/add to collection
        return this.prisma.bookmark.update({
          where: { id: existingBookmark.id },
          data: { collectionId },
        });
      }

      await this.prisma.bookmark.delete({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
      });

      return { bookmarked: false };
    }

    const data: Prisma.BookmarkUncheckedCreateInput = {
      userId,
      postId,
    };
    if (collectionId) {
      data.collectionId = collectionId;
    }

    await this.prisma.bookmark.create({
      data,
    });

    return { bookmarked: true };
  }

  /**
   * Move or assign a bookmarked post to a different collection.
   * Creates the bookmark if it doesn't exist.
   * @param userId - The user's ID
   * @param postId - The post ID
   * @param collectionId - Target collection ID (or null to remove from collection)
   */
  async updateCollection(
    userId: string,
    postId: string,
    collectionId: string | null,
  ) {
    // Find the bookmark first
    const bookmark = await this.prisma.bookmark.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (!bookmark) {
      // If not bookmarked, create it in the collection
      return this.prisma.bookmark.create({
        data: {
          userId,
          postId,
          collectionId,
        },
      });
    }

    return this.prisma.bookmark.update({
      where: { id: bookmark.id },
      data: { collectionId },
    });
  }

  /**
   * Check whether a user has bookmarked a specific post.
   * @param userId - The user's ID
   * @param postId - The post ID
   * @returns `{ bookmarked: boolean }`
   */
  async check(userId: string, postId: string) {
    const bookmark = await this.prisma.bookmark.findUnique({
      where: {
        userId_postId: { userId, postId },
      },
    });

    return { bookmarked: !!bookmark };
  }

  /**
   * Get the user's bookmarked posts with pagination. Optionally filtered by collection.
   * @param userId - The user's ID
   * @param page - Page number (default 1)
   * @param limit - Items per page (default 10)
   * @param collectionId - Optional collection filter
   */
  async getBookmarks(
    userId: string,
    page = 1,
    limit = 10,
    collectionId?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.BookmarkWhereInput = { userId };
    if (collectionId) {
      where.collectionId = collectionId;
    }

    const [bookmarks, total] = await Promise.all([
      this.prisma.bookmark.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          post: {
            include: {
              user: {
                include: {
                  profile: {
                    select: {
                      username: true,
                      avatar: true,
                    },
                  },
                },
              },
              _count: {
                select: {
                  likes: true,
                  comments: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.bookmark.count({ where }),
    ]);

    // If we have a collectionId, we might want to return collection info too?
    // For now, simpler return.
    let collectionName: string | undefined;
    if (collectionId) {
      const collection = await this.prisma.collection.findUnique({
        where: { id: collectionId },
        select: { name: true },
      });
      if (collection) collectionName = collection.name;
    }

    return {
      data: bookmarks.map((b) => b.post),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        collectionName,
      },
    };
  }

  /**
   * Get bookmarked posts within a specific collection, with ownership validation.
   * @param userId - The user's ID
   * @param collectionId - The collection to retrieve from
   * @param page - Page number (default 1)
   * @param limit - Items per page (default 10)
   * @throws NotFoundException if collection not found
   * @throws ForbiddenException if user does not own the collection
   */
  async getByCollection(
    userId: string,
    collectionId: string,
    page = 1,
    limit = 10,
  ) {
    const skip = (page - 1) * limit;

    // Verify collection ownership
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const [bookmarks, total] = await Promise.all([
      this.prisma.bookmark.findMany({
        where: { userId, collectionId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          post: {
            include: {
              user: {
                include: { profile: true },
              },
              media: {
                orderBy: { order: 'asc' },
              },
              _count: {
                select: { likes: true, comments: true },
              },
            },
          },
        },
      }),
      this.prisma.bookmark.count({ where: { userId, collectionId } }),
    ]);

    return {
      data: bookmarks.map((b) => b.post),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      collectionName: collection.name,
    };
  }
}
