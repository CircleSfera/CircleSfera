import { Test, type TestingModule } from '@nestjs/testing';
import type { Story } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStoryDto } from './dto/create-story.dto.js';
import { StoriesService } from './stories.service.js';

describe('StoriesService', () => {
  let service: StoriesService;

  const mockPrismaService = {
    story: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
    closeFriend: {
      findUnique: vi.fn(),
    },
    storyView: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    storyReaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'BullQueue_ai-processing', useValue: { add: vi.fn() } },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a story', async () => {
      const dto: CreateStoryDto = { url: 'test.jpg', mediaType: 'image' };
      mockPrismaService.story.create.mockResolvedValue({
        id: '1',
        ...dto,
      } as unknown as Story);

      const result = (await service.create('user-1', dto)) as Story;

      expect(result.id).toBe('1');
      expect(mockPrismaService.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            url: 'test.jpg',
          }) as unknown as Record<string, unknown>,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return stories with visibility filters', async () => {
      const userId = 'user-1';
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.story.findMany.mockResolvedValue([
        { id: 'public-1', userId: 'user-2', isCloseFriendsOnly: false },
        { id: 'cf-1', userId: 'user-2', isCloseFriendsOnly: true },
      ]);
      mockPrismaService.closeFriend.findUnique.mockResolvedValue(null); // Not a close friend

      const result = (await service.findAll(userId)) as Array<{ id: string }>;

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('public-1');
    });

    it('should allow viewing own close friends story', async () => {
      const userId = 'user-1';
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.story.findMany.mockResolvedValue([
        { id: 'cf-own', userId: 'user-1', isCloseFriendsOnly: true },
      ]);

      const result = (await service.findAll(userId)) as Array<{ id: string }>;

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cf-own');
    });
  });

  describe('view', () => {
    it('should create a new view if not exists', async () => {
      mockPrismaService.storyView.findUnique.mockResolvedValue(null);
      mockPrismaService.storyView.create.mockResolvedValue({ id: 'view-1' });

      const result = (await service.view('story-1', 'viewer-1')) as {
        id: string;
      };

      expect(result.id).toBe('view-1');
      expect(mockPrismaService.storyView.create).toHaveBeenCalled();
    });

    it('should return existing view if already seen', async () => {
      mockPrismaService.storyView.findUnique.mockResolvedValue({
        id: 'view-1',
      });

      const result = (await service.view('story-1', 'viewer-1')) as {
        id: string;
      };

      expect(result.id).toBe('view-1');
      expect(mockPrismaService.storyView.create).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should call deleteMany with correct filters', async () => {
      await service.delete('story-1', 'user-1');
      expect(mockPrismaService.story.deleteMany).toHaveBeenCalledWith({
        where: { id: 'story-1', userId: 'user-1' },
      });
    });
    describe('findByUser', () => {
      it('should return empty if user not found', async () => {
        mockPrismaService.profile.findUnique.mockResolvedValue(null);
        const result = await service.findByUser('unknown');
        expect(result).toEqual([]);
      });

      it('should return stories for public user', async () => {
        mockPrismaService.profile.findUnique.mockResolvedValue({ userId: 'u1', user: { settings: { privacyLevel: 'PUBLIC' } } });
        mockPrismaService.story.findMany.mockResolvedValue([{ id: 's1', views: [] }]);

        const result = await service.findByUser('user1');
        expect(result).toHaveLength(1);
      });

      it('should return empty for private user if not following', async () => {
        mockPrismaService.profile.findUnique.mockResolvedValue({ userId: 'u1', user: { settings: { privacyLevel: 'PRIVATE' } } });
        mockPrismaService.follow.findUnique.mockResolvedValue(null);

        const result = await service.findByUser('user1', 'u2');
        expect(result).toEqual([]);
      });
    });

    describe('getArchive', () => {
      it('should return all stories for the user', async () => {
        mockPrismaService.story.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
        const result = await service.getArchive('u1');
        expect(result).toHaveLength(2);
      });
    });

    describe('getViews', () => {
      it('should return users who viewed the story', async () => {
        mockPrismaService.storyView.findMany.mockResolvedValue([{ viewer: { id: 'u1' } }]);
        const result = await service.getViews('s1');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('u1');
      });
    });

    describe('addReaction', () => {
      it('should create new reaction', async () => {
        mockPrismaService.storyReaction.findUnique.mockResolvedValue(null);
        mockPrismaService.storyReaction.create.mockResolvedValue({ id: 'r1' });
        const result = await service.addReaction('s1', 'u1', '👍');
        expect(result.id).toBe('r1');
      });

      it('should update existing reaction', async () => {
        mockPrismaService.storyReaction.findUnique.mockResolvedValue({ id: 'r1' });
        mockPrismaService.storyReaction.update.mockResolvedValue({ id: 'r1', reaction: '🔥' });
        const result = await service.addReaction('s1', 'u1', '🔥');
        expect(mockPrismaService.storyReaction.update).toHaveBeenCalled();
      });
    });

    describe('getReactions', () => {
      it('should return all reactions for the story', async () => {
        mockPrismaService.storyReaction.findMany.mockResolvedValue([{ id: 'r1' }]);
        const result = await service.getReactions('s1');
        expect(result).toHaveLength(1);
      });
    });
  });});
