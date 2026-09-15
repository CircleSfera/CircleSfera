import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Story } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { UserHardDeletedEvent } from '../users/events/user-hard-deleted.event.js';
import type { CreateStoryDto } from './dto/create-story.dto.js';
import { StoriesService } from './stories.service.js';

describe('StoriesService', () => {
  let service: StoriesService;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    story: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    closeFriend: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    storyView: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    storyReaction: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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
        { provide: UploadsService, useValue: { deleteFile: vi.fn() } },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
        {
          provide: SystemSettingsService,
          useValue: { isEnabled: vi.fn(async () => true) },
        },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
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
            profileId: 'user-1',
            url: 'test.jpg',
          }) as unknown as Record<string, unknown>,
        }),
      );
    });

    it('should throw BadRequestException if isPremium is true but price is invalid', async () => {
      const dto: CreateStoryDto = {
        url: 'test.jpg',
        isPremium: true,
        priceCents: 50,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        'El precio de la historia premium debe estar entre €1.00 y €500.00.',
      );
    });
  });

  describe('findAll', () => {
    it('should return stories with visibility filters', async () => {
      const profileId = 'user-1';
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.story.findMany.mockResolvedValue([
        { id: 'public-1', profileId: 'user-2', isCloseFriendsOnly: false },
        { id: 'cf-1', profileId: 'user-2', isCloseFriendsOnly: true },
      ]);
      mockPrismaService.closeFriend.findUnique.mockResolvedValue(null); // Not a close friend

      const result = (await service.findAll(profileId)) as Array<{
        id: string;
      }>;

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('public-1');
    });

    it('should allow viewing own close friends story', async () => {
      const profileId = 'user-1';
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.story.findMany.mockResolvedValue([
        { id: 'cf-own', profileId: 'user-1', isCloseFriendsOnly: true },
      ]);

      const result = (await service.findAll(profileId)) as Array<{
        id: string;
      }>;

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
    it('should call delete with correct filters', async () => {
      mockPrismaService.story.findFirst.mockResolvedValueOnce({
        id: 'story-1',
        profileId: 'user-1',
      });
      await service.delete('story-1', 'user-1');
      expect(mockPrismaService.story.delete).toHaveBeenCalledWith({
        where: { id: 'story-1' },
      });
    });
    describe('findByUser', () => {
      it('should return empty if user not found', async () => {
        mockPrismaService.profile.findFirst.mockResolvedValue(null);
        const result = await service.findByUser('unknown');
        expect(result).toEqual([]);
      });

      it('should return stories for public user', async () => {
        mockPrismaService.profile.findFirst.mockResolvedValue({
          id: 'u1',
          user: { settings: { privacyLevel: 'PUBLIC' } },
        });
        mockPrismaService.story.findMany.mockResolvedValue([
          { id: 's1', views: [] },
        ]);

        const result = await service.findByUser('user1');
        expect(result).toHaveLength(1);
      });

      it('should return empty for private user if not following', async () => {
        mockPrismaService.profile.findFirst.mockResolvedValue({
          id: 'u1',
          user: { settings: { privacyLevel: 'PRIVATE' } },
        });
        mockPrismaService.follow.findUnique.mockResolvedValue(null);

        const result = await service.findByUser('user1', 'u2');
        expect(result).toEqual([]);
      });
    });

    describe('getArchive', () => {
      it('should return all stories for the user', async () => {
        mockPrismaService.story.findMany.mockResolvedValue([
          { id: 's1' },
          { id: 's2' },
        ]);
        const result = await service.getArchive('u1');
        expect(result).toHaveLength(2);
      });
    });

    describe('getViews', () => {
      it('should return users who viewed the story', async () => {
        mockPrismaService.storyView.findMany.mockResolvedValue([
          { viewer: { id: 'profile-1', user: { id: 'u1' } } },
        ]);
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
        mockPrismaService.storyReaction.findUnique.mockResolvedValue({
          id: 'r1',
        });
        mockPrismaService.storyReaction.update.mockResolvedValue({
          id: 'r1',
          reaction: '🔥',
        });
        await service.addReaction('s1', 'u1', '🔥');
        expect(mockPrismaService.storyReaction.update).toHaveBeenCalled();
      });
    });

    describe('getReactions', () => {
      it('should return all reactions for the story', async () => {
        mockPrismaService.storyReaction.findMany.mockResolvedValue([
          { id: 'r1' },
        ]);
        const result = await service.getReactions('s1');
        expect(result).toHaveLength(1);
      });
    });

    describe('handleUserDeleted (LIFE-002)', () => {
      it('cleans up media for stories belonging to all profileIds in the canonical event', async () => {
        mockPrismaService.story.findMany.mockResolvedValue([
          {
            id: 's1',
            url: 'https://cdn.example.com/s1.jpg',
            thumbnailUrl: 'https://cdn.example.com/s1-thumb.jpg',
          },
          {
            id: 's2',
            url: 'https://cdn.example.com/s2.mp4',
            thumbnailUrl: null,
          },
        ]);

        const event = new UserHardDeletedEvent({
          userId: 'user-1',
          profileIds: ['prof-1', 'prof-2'],
        });

        await service.handleUserDeleted(event);

        expect(mockPrismaService.story.findMany).toHaveBeenCalledWith({
          where: { profileId: { in: ['prof-1', 'prof-2'] } },
        });
        expect(eventEmitter.emit).toHaveBeenCalledWith('media.delete_batch', {
          mediaUrls: expect.arrayContaining([
            'https://cdn.example.com/s1.jpg',
            'https://cdn.example.com/s1-thumb.jpg',
            'https://cdn.example.com/s2.mp4',
          ]),
        });
      });

      it('does nothing when profileIds and profileId are empty', async () => {
        const event = new UserHardDeletedEvent({
          userId: 'user-empty',
          profileIds: [],
        });

        await service.handleUserDeleted(event);

        expect(mockPrismaService.story.findMany).not.toHaveBeenCalled();
        expect(eventEmitter.emit).not.toHaveBeenCalled();
      });

      it('handles post-cascade state gracefully when stories are already removed or query fails', async () => {
        mockPrismaService.story.findMany.mockResolvedValue([]);

        const event = new UserHardDeletedEvent({
          userId: 'user-cascaded',
          profileIds: ['prof-cascaded'],
        });

        await expect(service.handleUserDeleted(event)).resolves.toBeUndefined();
        expect(eventEmitter.emit).not.toHaveBeenCalled();
      });
    });
  });
});
