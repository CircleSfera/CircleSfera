import { NotFoundException } from '@nestjs/common';
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

vi.mock('../common/utils/media-duration.util.js', () => ({
  assertVideoUrlDuration: vi.fn().mockResolvedValue(undefined),
}));

describe('StoriesService', () => {
  let service: StoriesService;
  let eventEmitter: EventEmitter2;
  let systemSettingsService: SystemSettingsService;
  let mockAiQueue: { add: ReturnType<typeof vi.fn> };
  let mockUploadsService: { deleteFile: ReturnType<typeof vi.fn> };

  const mockPrismaService = {
    story: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
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
    audio: {
      findUnique: vi.fn(),
    },
    place: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    storyUnlock: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    mockAiQueue = { add: vi.fn().mockResolvedValue({ id: 'ai-job-1' }) };
    mockUploadsService = { deleteFile: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'BullQueue_ai-processing', useValue: mockAiQueue },
        { provide: UploadsService, useValue: mockUploadsService },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
        {
          provide: SystemSettingsService,
          useValue: { isEnabled: vi.fn(async () => true) },
        },
      ],
    }).compile();

    service = module.get<StoriesService>(StoriesService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    systemSettingsService = module.get<SystemSettingsService>(
      SystemSettingsService,
    );
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws ForbiddenException when content posting is disabled', async () => {
      vi.spyOn(systemSettingsService, 'isEnabled').mockResolvedValueOnce(false);

      await expect(
        service.create('user-1', { url: 'test.jpg' }),
      ).rejects.toThrow('CONTENT_POSTING_DISABLED');
    });

    it('should throw BadRequestException if isPremium is true but price is invalid', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        accountType: 'CREATOR',
      });
      const dto: CreateStoryDto = {
        url: 'test.jpg',
        isPremium: true,
        priceCents: 50,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        'El precio de la historia premium debe estar entre €5.00 y €500.00.',
      );
    });

    it('rejects premium stories from PERSONAL accounts', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        accountType: 'PERSONAL',
      });
      const dto: CreateStoryDto = {
        url: 'test.jpg',
        isPremium: true,
        priceCents: 500,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        'Solo las cuentas Creator o Business pueden publicar historias premium.',
      );
    });

    it('throws BadRequestException if audioId is not found in database', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create('user-1', { url: 'test.jpg', audioId: 'aud-404' }),
      ).rejects.toThrow('AUDIO_NOT_FOUND');
    });

    it('should create a story with audio, place attachment, and background moderation', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValueOnce({
        id: 'aud-1',
        duration: 60,
      });
      mockPrismaService.place.findUnique.mockResolvedValueOnce({
        id: 'pl-1',
        name: 'Madrid Central',
        fullName: 'Madrid Central, Spain',
      });
      const dto: CreateStoryDto = {
        url: 'https://cdn.example.com/story.mp4',
        mediaType: 'video',
        audioId: 'aud-1',
        audioStartMs: 5000,
        placeId: 'pl-1',
      };
      mockPrismaService.story.create.mockResolvedValue({
        id: 'story-1',
        ...dto,
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      } as unknown as Story);

      const result = await service.create('user-1', dto);

      expect(result.id).toBe('story-1');
      expect(mockPrismaService.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            profileId: 'user-1',
            url: dto.url,
            audioId: 'aud-1',
            audioStartMs: 5000,
            placeId: 'pl-1',
            location: 'Madrid Central, Spain',
          }),
        }),
      );
      expect(mockAiQueue.add).toHaveBeenCalledWith('moderate-content', {
        targetId: 'story-1',
        targetType: 'STORY',
        text: '',
        mediaUrls: ['https://cdn.example.com/thumb.jpg'],
      });
    });

    it('creates scheduled story without queuing immediate moderation', async () => {
      const futureDate = new Date(Date.now() + 1000000).toISOString();
      mockPrismaService.story.create.mockResolvedValue({
        id: 'story-sched',
        scheduledAt: new Date(futureDate),
      } as unknown as Story);

      const res = await service.create('user-1', {
        url: 'test.jpg',
        scheduledAt: new Date(futureDate),
      });
      expect(res.id).toBe('story-sched');
      expect(mockAiQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return stories with visibility filters for authenticated user', async () => {
      const profileId = 'user-1';
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.story.findMany.mockResolvedValue([
        { id: 'public-1', profileId: 'user-2', isCloseFriendsOnly: false },
        { id: 'cf-1', profileId: 'user-2', isCloseFriendsOnly: true },
      ]);
      mockPrismaService.closeFriend.findUnique.mockResolvedValue(null); // Not a close friend

      const result = await service.findAll(profileId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('public-1');
    });

    it('should allow viewing own close friends story', async () => {
      const profileId = 'user-1';
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.story.findMany.mockResolvedValue([
        { id: 'cf-own', profileId: 'user-1', isCloseFriendsOnly: true },
      ]);

      const result = await service.findAll(profileId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cf-own');
    });

    it('returns public stories for guest viewers and filters close-friends', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        { id: 'pub-story', profileId: 'author-1', isCloseFriendsOnly: false },
        { id: 'cf-story', profileId: 'author-1', isCloseFriendsOnly: true },
      ]);

      const result = await service.findAll(undefined);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('pub-story');
      expect(mockPrismaService.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isCloseFriendsOnly: false,
          }),
        }),
      );
    });
  });

  describe('applyStoryPremiumLocks', () => {
    it('locks premium stories for guest viewer with thumbnail fallback', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'prem-1',
          profileId: 'author-1',
          isPremium: true,
          url: 'https://cdn.example.com/prem.jpg',
          standardUrl: 'https://cdn.example.com/prem-std.jpg',
          thumbnailUrl: 'https://cdn.example.com/prem-thumb.jpg',
          isCloseFriendsOnly: false,
        },
      ]);

      const result = await service.findAll(undefined);
      expect(result[0].isLocked).toBe(true);
      expect(result[0].url).toBe('https://cdn.example.com/prem-thumb.jpg');
      expect(result[0].standardUrl).toBeNull();
    });

    it('unlocks premium stories when viewer is the author', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'prem-own',
          profileId: 'me-1',
          isPremium: true,
          url: 'https://cdn.example.com/mine.jpg',
          isCloseFriendsOnly: false,
        },
      ]);

      const result = await service.findAll('me-1');
      expect(result[0].isLocked).toBe(false);
      expect(result[0].url).toBe('https://cdn.example.com/mine.jpg');
    });

    it('unlocks premium stories when viewer purchased an unlock', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'prem-bought',
          profileId: 'author-2',
          isPremium: true,
          url: 'https://cdn.example.com/bought.jpg',
          isCloseFriendsOnly: false,
        },
      ]);
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'user-viewer',
      });
      mockPrismaService.storyUnlock.findMany.mockResolvedValueOnce([
        { storyId: 'prem-bought' },
      ]);

      const result = await service.findAll('viewer-prof');
      expect(result[0].isLocked).toBe(false);
    });

    it('locks premium stories when viewer has no unlock or viewer profile not found', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'prem-locked',
          profileId: 'author-2',
          isPremium: true,
          url: 'https://cdn.example.com/secret.jpg',
          isCloseFriendsOnly: false,
        },
      ]);
      mockPrismaService.profile.findUnique.mockResolvedValueOnce(null);

      const result = await service.findAll('viewer-prof-missing');
      expect(result[0].isLocked).toBe(true);
      expect(result[0].url).toBe('');
    });
  });

  describe('view', () => {
    it('should create a new view if not exists', async () => {
      mockPrismaService.storyView.findUnique.mockResolvedValue(null);
      mockPrismaService.storyView.create.mockResolvedValue({ id: 'view-1' });

      const result = await service.view('story-1', 'viewer-1');

      expect(result.id).toBe('view-1');
      expect(mockPrismaService.storyView.create).toHaveBeenCalled();
    });

    it('should return existing view if already seen', async () => {
      mockPrismaService.storyView.findUnique.mockResolvedValue({
        id: 'view-1',
      });

      const result = await service.view('story-1', 'viewer-1');

      expect(result.id).toBe('view-1');
      expect(mockPrismaService.storyView.create).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes story and its files, handling deleteFile failures gracefully', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 'story-1',
        profileId: 'user-1',
        url: 'https://cdn.example.com/s.jpg',
        standardUrl: 'https://cdn.example.com/s-std.jpg',
        thumbnailUrl: 'https://cdn.example.com/s-th.jpg',
      });
      mockUploadsService.deleteFile.mockRejectedValue(new Error('S3 error'));
      mockPrismaService.story.delete.mockResolvedValue({});

      await service.delete('story-1');

      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/s.jpg',
      );
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/s-std.jpg',
      );
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/s-th.jpg',
      );
      expect(mockPrismaService.story.delete).toHaveBeenCalledWith({
        where: { id: 'story-1' },
      });
    });

    it('throws NotFoundException when story is not found', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce(null);

      await expect(service.delete('missing-story')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.story.delete).not.toHaveBeenCalled();
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

  describe('cleanupExpiredStories', () => {
    it('deletes expired stories and their media, logging count when positive', async () => {
      mockPrismaService.story.findMany.mockResolvedValueOnce([
        {
          id: 'exp-1',
          url: 'https://cdn.example.com/exp.jpg',
          standardUrl: 'https://cdn.example.com/exp-std.jpg',
          thumbnailUrl: 'https://cdn.example.com/exp-th.jpg',
        },
      ]);
      mockUploadsService.deleteFile.mockRejectedValue(new Error('fail'));
      mockPrismaService.story.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.cleanupExpiredStories();
      expect(result).toEqual({ count: 1 });
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/exp.jpg',
      );
      expect(mockPrismaService.story.deleteMany).toHaveBeenCalled();
    });

    it('handles zero expired stories gracefully without logging count', async () => {
      mockPrismaService.story.findMany.mockResolvedValueOnce([]);
      mockPrismaService.story.deleteMany.mockResolvedValueOnce({ count: 0 });

      const result = await service.cleanupExpiredStories();
      expect(result).toEqual({ count: 0 });
    });

    it('logs and rethrows database query errors', async () => {
      mockPrismaService.story.findMany.mockRejectedValueOnce(
        new Error('DB crash'),
      );

      await expect(service.cleanupExpiredStories()).rejects.toThrow('DB crash');
    });
  });

  describe('handleUserDeleted', () => {
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

    it('uses single profileId when profileIds array is not provided', async () => {
      mockPrismaService.story.findMany.mockResolvedValueOnce([
        { id: 's3', url: 'https://cdn.example.com/s3.jpg', thumbnailUrl: null },
      ]);

      await service.handleUserDeleted({ profileId: 'single-prof' });

      expect(mockPrismaService.story.findMany).toHaveBeenCalledWith({
        where: { profileId: { in: ['single-prof'] } },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('media.delete_batch', {
        mediaUrls: ['https://cdn.example.com/s3.jpg'],
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

    it('handles stories with no media URLs without emitting delete event', async () => {
      mockPrismaService.story.findMany.mockResolvedValueOnce([
        { id: 'no-media-story', url: null, thumbnailUrl: null },
      ]);

      await service.handleUserDeleted({ profileId: 'prof-no-media' });

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
