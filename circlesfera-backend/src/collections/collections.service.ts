import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
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
   * @param profileId - The owner's profile ID
   * @param name - The collection name
   */
  async create(profileId: string, name: string): Promise<any> {
    return await this.prisma.collection.create({
      data: {
        profileId,
        name,
      },
    });
  }

  /**
   * List all collections for a profile with bookmark counts and auto-derived cover URLs.
   * @param profileId - The owner's profile ID
   */
  async findAll(profileId: string) {
    const collections = await this.prisma.collection.findMany({
      where: { profileId },
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
   * @param profileId - The requesting profile ID (for ownership check)
   * @param id - The collection ID
   */
  async findOne(profileId: string, id: string): Promise<any> {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        bookmarks: {
          include: {
            post: true,
          },
        },
      },
    });

    if (!collection)
      throw AppException.NotFound(
        ErrorCode.COLLECTION_NOT_FOUND,
        'Collection not found',
      );
    if (collection.profileId !== profileId)
      throw AppException.Forbidden(ErrorCode.FORBIDDEN_ACCESS, 'Access denied');

    return collection;
  }

  /**
   * Rename a collection.
   * @param profileId - The requesting profile ID (for ownership check)
   * @param id - The collection ID
   * @param name - The new collection name
   */
  async update(profileId: string, id: string, name: string): Promise<any> {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection)
      throw AppException.NotFound(
        ErrorCode.COLLECTION_NOT_FOUND,
        'Collection not found',
      );
    if (collection.profileId !== profileId)
      throw AppException.Forbidden(ErrorCode.FORBIDDEN_ACCESS, 'Access denied');

    return await this.prisma.collection.update({
      where: { id },
      data: { name },
    });
  }

  /**
   * Delete a collection (bookmarks are unaffected).
   * @param profileId - The requesting profile ID (for ownership check)
   * @param id - The collection ID
   */
  async delete(profileId: string, id: string): Promise<any> {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
    });

    if (!collection)
      throw AppException.NotFound(
        ErrorCode.COLLECTION_NOT_FOUND,
        'Collection not found',
      );
    if (collection.profileId !== profileId)
      throw AppException.Forbidden(ErrorCode.FORBIDDEN_ACCESS, 'Access denied');

    return await this.prisma.collection.delete({
      where: { id },
    });
  }
}
