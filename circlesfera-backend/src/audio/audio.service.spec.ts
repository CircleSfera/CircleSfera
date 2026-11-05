import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHOR_ID,
  BUYER_ID,
  expectClosed,
  expectWhole,
  inlinePaidMedia,
  paidPost,
  realPaywall,
  STRANGER_ID,
} from '../common/testing/paid-posts.js';
import { PostPaywallService } from '../posts/services/post-paywall.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AudioService } from './audio.service.js';

describe('AudioService', () => {
  let service: AudioService;

  const mockPrismaService = {
    audio: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    block: { findMany: vi.fn().mockResolvedValue([]) },
    post: {
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudioService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PostPaywallService, useValue: realPaywall() },
      ],
    }).compile();

    service = module.get<AudioService>(AudioService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new audio track', async () => {
      const dto = {
        title: 'Original Sound',
        artist: 'CircleSfera User',
        url: 'https://cdn.example.com/audio.mp3',
        duration: 30,
      };

      mockPrismaService.audio.create.mockResolvedValue({
        id: 'audio-1',
        ...dto,
      });

      const result = await service.create(dto);
      expect(mockPrismaService.audio.create).toHaveBeenCalledWith({
        data: dto,
      });
      expect(result).toHaveProperty('id', 'audio-1');
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if audio track does not exist', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return audio track if found', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue({
        id: 'audio-1',
        title: 'Original Sound',
      });

      const result = await service.findOne('audio-1');
      expect(result).toEqual({ id: 'audio-1', title: 'Original Sound' });
    });
  });

  describe('search', () => {
    it('should search tracks by title or artist', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-1', title: 'Pop Track', artist: 'Artist A' },
      ]);

      const result = await service.search('Pop');
      expect(mockPrismaService.audio.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('should return all audio tracks', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-1', title: 'Track 1' },
      ]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('getTrending', () => {
    it('should return top 10 trending audio tracks', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-1', title: 'Trending 1' },
      ]);
      const result = await service.getTrending();
      expect(result).toHaveLength(1);
      expect(mockPrismaService.audio.findMany).toHaveBeenCalledWith({
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findAllPaginated', () => {
    it('should return paginated items without search', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-1', title: 'Track 1' },
      ]);
      mockPrismaService.audio.count.mockResolvedValue(1);

      const result = await service.findAllPaginated(1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should return paginated items with search filter', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-2', title: 'Rock Song' },
      ]);
      mockPrismaService.audio.count.mockResolvedValue(1);

      const result = await service.findAllPaginated(1, 10, 'Rock');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if audio track does not exist', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue(null);

      await expect(
        service.update('invalid-id', { title: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update audio track if exists', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue({ id: 'audio-1' });
      mockPrismaService.audio.update.mockResolvedValue({
        id: 'audio-1',
        title: 'Updated Title',
      });

      const result = await service.update('audio-1', {
        title: 'Updated Title',
      });
      expect(result.title).toBe('Updated Title');
    });
  });

  describe('getAudioPosts', () => {
    beforeEach(() => {
      mockPrismaService.audio.findUnique.mockResolvedValue({ id: 'audio-1' });
      mockPrismaService.block.findMany.mockResolvedValue([]);
    });

    it('lists a page of the posts a viewer may find, newest first', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: 'post-1', audioId: 'audio-1', profileId: 'p1' },
      ]);
      mockPrismaService.post.count.mockResolvedValue(41);
      mockPrismaService.block.findMany.mockResolvedValue([
        { blockerId: 'viewer-1', blockedId: 'blocked-1' },
      ]);

      const result = await service.getAudioPosts(
        'audio-1',
        { page: 2, limit: 20 },
        'viewer-1',
      );

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(41);
      const args = mockPrismaService.post.findMany.mock.calls.at(-1)?.[0];
      expect(args.skip).toBe(20);
      expect(args.take).toBe(20);
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(args.where.audioId).toBe('audio-1');
      // Public posts of public Profiles, none across a block, plus the
      // viewer's own.
      const [others, own] = args.where.OR;
      expect(others).toMatchObject({
        visibility: 'PUBLIC',
        moderationStatus: 'VISIBLE',
        deletedAt: null,
        archivedAt: null,
        profile: { privacyLevel: 'PUBLIC' },
        profileId: { notIn: ['blocked-1'] },
      });
      expect(own.profileId).toBe('viewer-1');
    });

    it('continues after the cursor it is given', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);

      await service.getAudioPosts('audio-1', { limit: 10, cursor: 'post-9' });

      const args = mockPrismaService.post.findMany.mock.calls.at(-1)?.[0];
      expect(args.cursor).toEqual({ id: 'post-9' });
      expect(args.skip).toBe(1);
    });

    it('leaves out a like count the author hid, for everyone but the author', async () => {
      const post = {
        id: 'post-1',
        profileId: 'author-1',
        hideLikes: true,
        _count: { likes: 5, comments: 1 },
      };
      mockPrismaService.post.findMany.mockResolvedValue([post]);

      const seen = await service.getAudioPosts('audio-1', {}, 'viewer-1');
      const own = await service.getAudioPosts('audio-1', {}, 'author-1');

      expect((seen.data[0] as any)._count).toEqual({
        likes: null,
        comments: 1,
      });
      expect((own.data[0] as any)._count).toEqual({ likes: 5, comments: 1 });
    });

    it('answers missing for a song that does not exist', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue(null);

      await expect(service.getAudioPosts('nope', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.post.findMany).not.toHaveBeenCalled();
    });
  });

  describe('a paid post using the sound', () => {
    const postsFor = async (viewer?: string) => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        paidPost([inlinePaidMedia()]),
      ]);
      mockPrismaService.audio.findUnique.mockResolvedValue({ id: 'audio-1' });
      return (await service.getAudioPosts('audio-1', {}, viewer)).data[0];
    };

    it('is closed to a viewer who has not unlocked it', async () => {
      expectClosed(await postsFor(STRANGER_ID));
    });

    it('is whole for its author and for someone who unlocked it', async () => {
      expectWhole(await postsFor(AUTHOR_ID));
      expectWhole(await postsFor(BUYER_ID));
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if audio track does not exist', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue(null);

      await expect(service.delete('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete audio track if exists', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue({ id: 'audio-1' });
      mockPrismaService.audio.delete.mockResolvedValue({ id: 'audio-1' });

      const result = await service.delete('audio-1');
      expect(mockPrismaService.audio.delete).toHaveBeenCalledWith({
        where: { id: 'audio-1' },
      });
      expect(result).toEqual({ id: 'audio-1' });
    });
  });
});
