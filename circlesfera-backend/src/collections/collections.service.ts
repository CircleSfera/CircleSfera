import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Service for bookmark collections (CRUD). Each collection groups bookmarked posts
// And auto-derives a cover image from the first bookmark.
@Injectable()
export class CollectionsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  // Create a new bookmark collection.
  // Param profileId: The owner's profile ID
  // Param data: Name and optional description
  async create(
    profileId: string,
    data: { name: string; description?: string },
  ): Promise<any> {
    const description = data.description?.trim() || null;
    return await this.prisma.collection.create({
      data: {
        profileId,
        name: data.name.trim(),
        description,
      },
    });
  }

  // List all collections for a profile with bookmark counts and auto-derived cover URLs.
  // Param profileId: The owner's profile ID
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

  // Get a single collection with all its bookmarked posts.
  // Param profileId: The requesting profile ID (for ownership check)
  // Param id: The collection ID
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

  // Update a collection name and optional description.
  // Param profileId: The requesting profile ID (for ownership check)
  // Param id: The collection ID
  // Param data: New name and optional description
  async update(
    profileId: string,
    id: string,
    data: { name: string; description?: string },
  ): Promise<any> {
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

    const patch: { name: string; description?: string | null } = {
      name: data.name.trim(),
    };
    if (data.description !== undefined) {
      patch.description = data.description.trim() || null;
    }

    return await this.prisma.collection.update({
      where: { id },
      data: patch,
    });
  }

  // Delete a collection (bookmarks are unaffected).
  // Param profileId: The requesting profile ID (for ownership check)
  // Param id: The collection ID
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
