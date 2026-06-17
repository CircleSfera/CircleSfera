import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateAudioDto } from './dto/create-audio.dto.js';

/** Service for audio track CRUD, search, and trending retrieval. */
@Injectable()
export class AudioService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Create a new audio track record.
   * @param dto - Audio metadata (title, artist, url, duration)
   */
  async create(dto: CreateAudioDto) {
    return await this.prisma.audio.create({
      data: dto,
    });
  }

  /** List all audio tracks, ordered by creation date descending. */
  async findAll() {
    return await this.prisma.audio.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single audio track by ID.
   * @param id - The audio track's ID
   * @throws NotFoundException if not found
   */
  async findOne(id: string) {
    const audio = await this.prisma.audio.findUnique({
      where: { id },
    });
    if (!audio) throw new NotFoundException('Audio track not found');
    return audio;
  }

  /**
   * Search audio tracks by title or artist (case-insensitive).
   * @param query - The search term
   */
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

  /** Get the 10 most recently added audio tracks (trending). */
  async getTrending() {
    return await this.prisma.audio.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Paginated listing with optional search for admin. */
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

  /** Update an audio track by ID. */
  async update(id: string, dto: Partial<CreateAudioDto>) {
    const audio = await this.prisma.audio.findUnique({ where: { id } });
    if (!audio) throw new NotFoundException('Audio track not found');
    return this.prisma.audio.update({ where: { id }, data: dto });
  }

  /** Delete an audio track by ID. */
  async delete(id: string) {
    const audio = await this.prisma.audio.findUnique({ where: { id } });
    if (!audio) throw new NotFoundException('Audio track not found');
    return this.prisma.audio.delete({ where: { id } });
  }

  /**
   * Get all posts (Posts and Frames) using a specific audio track.
   * @param id - The audio track's ID
   */
  async getAudioPosts(id: string) {
    return await this.prisma.post.findMany({
      where: { audioId: id, visibility: 'PUBLIC', moderationStatus: 'VISIBLE' },
      include: {
        user: { include: { profile: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
