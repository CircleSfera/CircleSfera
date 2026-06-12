import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Service for bookmark collections (CRUD). Each collection groups bookmarked posts
 * and auto-derives a cover image from the first bookmark.
 */
@Injectable()
export class CollectionsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /**
   * Create a new bookmark collection.
   * @param userId - The owner's user ID
   * @param name - The collection name
   */
  async create(userId: string, name: string): Promise<any> {
    return await this.prisma.collection.create({
      data: {
        userId,
        name,
      },
    });
  }

  /**
   * List all collections for a user with bookmark counts and auto-derived cover URLs.
   * @param userId - The owner's user ID
   */
  async findAll(userId: string) {
    const collections = await this.prisma.collection.findMany({
      where: { userId },
      include: {
        bookmarks: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            post: {
              select: {
                media: true,
              },
            },
          },
        },
        _count: {
          select: { bookmarks: true },
        },
      },
    });

    return collections.map((c) => {
      let coverUrl = c.coverUrl;
      const bookmarks = c.bookmarks as unknown as Array<{
        post: { media: Array<{ url: string }> };
      }>;
      if (!coverUrl && bookmarks && bookmarks.length > 0) {
        const firstPost = bookmarks[0].post;
        if (firstPost.media && firstPost.media.length > 0) {
          coverUrl = firstPost.media[0].url;
        }
      }

      return {
        ...c,
        coverUrl,
      };
    });
  }

  /**
   * Get a single collection with all its bookmarked posts.
   * @param userId - The requesting user's ID (for ownership check)
   * @param id - The collection ID
   * @throws NotFoundException if collection not found
   * @throws ForbiddenException if user does not own the collection
   */
  async findOne(userId: string, id: string): Promise<any> {
    const collection = (await this.prisma.collection.findUnique({
      where: { id },
      include: {
        bookmarks: {
          include: {
            post: true,
          },
        },
      },
    })) as { userId: string } | null;

    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId)
      throw new ForbiddenException('Access denied');

    return collection;
  }

  /**
   * Rename a collection.
   * @param userId - The requesting user's ID (for ownership check)
   * @param id - The collection ID
   * @param name - The new collection name
   * @throws NotFoundException if collection not found
   * @throws ForbiddenException if user does not own the collection
   */
  async update(userId: string, id: string, name: string): Promise<any> {
    const collection = (await this.prisma.collection.findUnique({
      where: { id },
    })) as { userId: string } | null;

    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId)
      throw new ForbiddenException('Access denied');

    return await this.prisma.collection.update({
      where: { id },
      data: { name },
    });
  }

  /**
   * Delete a collection (bookmarks are unaffected).
   * @param userId - The requesting user's ID (for ownership check)
   * @param id - The collection ID
   * @throws NotFoundException if collection not found
   * @throws ForbiddenException if user does not own the collection
   */
  async delete(userId: string, id: string): Promise<any> {
    const collection = (await this.prisma.collection.findUnique({
      where: { id },
    })) as { userId: string } | null;

    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.userId !== userId)
      throw new ForbiddenException('Access denied');

    return await this.prisma.collection.delete({
      where: { id },
    });
  }
}
