import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  createPaginatedResult,
  type PaginationDto,
} from '../common/dto/pagination.dto.js';
import {
  publicPostListWhere,
  withLikeCountAsSeenBy,
} from '../common/policies/public-post-list.policy.js';
import { SHOWN_COMMENTS_COUNT } from '../common/policies/removed-content.policy.js';
import { PostPaywallService } from '../posts/services/post-paywall.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAudioDto } from './dto/create-audio.dto.js';

// Service for audio track CRUD, search, and trending retrieval.
@Injectable()
export class AudioService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PostPaywallService)
    private readonly postPaywall: PostPaywallService,
  ) {}

  // Create a new audio track record.
  // Param dto: Audio metadata (title, artist, url, duration)
  async create(dto: CreateAudioDto) {
    return await this.prisma.audio.create({
      data: dto,
    });
  }

  // List all audio tracks, ordered by creation date descending.
  async findAll() {
    return await this.prisma.audio.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get a single audio track by ID.
  // Param id: The audio track's ID
  // Throws NotFoundException if not found
  async findOne(id: string) {
    const audio = await this.prisma.audio.findUnique({
      where: { id },
    });
    if (!audio) throw new NotFoundException('Audio track not found');
    return audio;
  }

  // Search audio tracks by title or artist (case-insensitive).
  // Param query: The search term
  async search(query: string) {
    return await this.prisma.audio.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { artist: { contains: query, mode: 'insensitive' } },
        ],
      },
    });
  }

  // Get the 10 most recently added audio tracks (trending).
  async getTrending() {
    return await this.prisma.audio.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Paginated listing with optional search for admin.
  async findAllPaginated(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { artist: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.audio.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.audio.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Update an audio track by ID.
  async update(id: string, dto: Partial<CreateAudioDto>) {
    const audio = await this.prisma.audio.findUnique({ where: { id } });
    if (!audio) throw new NotFoundException('Audio track not found');
    return this.prisma.audio.update({ where: { id }, data: dto });
  }

  // Delete an audio track by ID.
  async delete(id: string) {
    const audio = await this.prisma.audio.findUnique({ where: { id } });
    if (!audio) throw new NotFoundException('Audio track not found');
    return this.prisma.audio.delete({ where: { id } });
  }

  // Get all posts (Posts and Frames) using a specific audio track, as the
  // viewer sees them: a paid post they have not unlocked is closed.
  // Param id: The audio track's ID
  // The posts and Frames that use a song, newest first, a page at a time:
  // only those the viewer may find in a public list, with a like count the
  // author hid left out.
  async getAudioPosts(
    id: string,
    pagination: PaginationDto,
    viewerProfileId?: string,
  ) {
    await this.findOne(id);
    const { page = 1, limit = 20, cursor } = pagination;
    const where: Prisma.PostWhereInput = {
      audioId: id,
      ...(await publicPostListWhere(this.prisma, viewerProfileId)),
    };
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip: cursor ? 1 : (page - 1) * limit,
        take: limit,
        ...(cursor && { cursor: { id: cursor } }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          profile: {
            select: { id: true, username: true, avatar: true, fullName: true },
          },
          media: { orderBy: { order: 'asc' } },
          _count: {
            select: { likes: true, comments: SHOWN_COMMENTS_COUNT },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);
    const shown = await this.postPaywall.applyPaywall(
      posts.map((post) => withLikeCountAsSeenBy(post, viewerProfileId)),
      viewerProfileId,
    );
    return createPaginatedResult(
      shown,
      total,
      page,
      limit,
      shown.length > 0 ? shown[shown.length - 1].id : undefined,
    );
  }
}
