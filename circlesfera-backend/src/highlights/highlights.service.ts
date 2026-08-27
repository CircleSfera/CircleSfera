import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateHighlightDto } from './dto/create-highlight.dto.js';
import type { UpdateHighlightDto } from './dto/update-highlight.dto.js';

/** Service for story highlights: permanent curated groups of expired stories. */
@Injectable()
export class HighlightsService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  /**
   * Create a new highlight from selected stories.
   * @param profileId - The owner's profile ID
   * @param createHighlightDto - Title, coverUrl, and story IDs
   */
  async create(profileId: string, createHighlightDto: CreateHighlightDto) {
    const { title, coverUrl, storyIds } = createHighlightDto;

    const highlight = await this.prisma.highlight.create({
      data: {
        profileId,
        title,
        coverUrl,
        stories: {
          create: storyIds.map((storyId) => ({
            story: { connect: { id: storyId } },
          })),
        },
      },
      include: {
        stories: {
          include: {
            story: true,
          },
        },
      },
    });

    return highlight;
  }

  /**
   * List all highlights for a profile, ordered by creation date descending.
   * @param profileId - The owner's profile ID
   */
  async findAll(profileId: string) {
    return this.prisma.highlight.findMany({
      where: { profileId },
      include: {
        stories: {
          include: {
            story: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get a single highlight by ID, with its stories.
   * @param id - The highlight ID
   * @throws NotFoundException if highlight not found
   */
  async findOne(id: string) {
    const highlight = await this.prisma.highlight.findUnique({
      where: { id },
      include: {
        profile: true,
        stories: {
          include: {
            story: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!highlight) {
      throw AppException.NotFound(
        ErrorCode.HIGHLIGHT_NOT_FOUND,
        'Highlight not found',
      );
    }

    return highlight;
  }

  /**
   * Update a highlight (title, cover, or stories).
   * @param id - Highlight ID
   * @param profileId - Owner's profile ID
   * @param updateHighlightDto - New data
   */
  async update(
    id: string,
    profileId: string,
    updateHighlightDto: UpdateHighlightDto,
  ) {
    const { title, coverUrl, storyIds } = updateHighlightDto;

    const existing = await this.prisma.highlight.findFirst({
      where: { id, profileId },
    });

    if (!existing) {
      throw AppException.NotFound(
        ErrorCode.HIGHLIGHT_NOT_FOUND,
        'Highlight not found or you do not have permission',
      );
    }

    return this.prisma.highlight.update({
      where: { id },
      data: {
        title,
        coverUrl,
        ...(storyIds && {
          stories: {
            deleteMany: {},
            create: storyIds.map((storyId) => ({
              story: { connect: { id: storyId } },
            })),
          },
        }),
      },
      include: {
        stories: {
          include: {
            story: true,
          },
        },
      },
    });
  }

  /**
   * Delete a highlight owned by the profile.
   * @param id - The highlight ID
   * @param profileId - The requesting profile ID (for ownership check)
   * @throws NotFoundException if highlight not found or not owned
   */
  async remove(id: string, profileId: string) {
    const highlight = await this.prisma.highlight.findFirst({
      where: { id, profileId },
    });

    if (!highlight) {
      throw AppException.NotFound(
        ErrorCode.HIGHLIGHT_NOT_FOUND,
        'Highlight not found or you do not have permission',
      );
    }

    return this.prisma.highlight.delete({
      where: { id },
    });
  }
}
