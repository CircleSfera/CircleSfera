import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Story } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeKeysetCursor } from '../common/pagination/keyset.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoryStickersService } from '../story-stickers/story-stickers.service.js';
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
  let mockUploadsService: {
    deleteFile: ReturnType<typeof vi.fn>;
    ownsUrl: ReturnType<typeof vi.fn>;
    enqueueStoryOverlay: ReturnType<typeof vi.fn>;
  };

  const mockPrismaService = {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((cb) => cb(mockPrismaService)),
    block: { findFirst: vi.fn().mockResolvedValue(null) },
    story: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
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
    media: {
      create: vi.fn().mockResolvedValue({ id: 'media-1' }),
    },
  };

  let module: TestingModule;

  beforeEach(async () => {
    mockAiQueue = { add: vi.fn().mockResolvedValue({ id: 'ai-job-1' }) };
    mockUploadsService = {
      deleteFile: vi.fn().mockResolvedValue(undefined),
      ownsUrl: vi.fn(() => true),
      enqueueStoryOverlay: vi.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
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
        {
          provide: StoryStickersService,
          useValue: {
            createForStory: vi.fn(async (): Promise<string[]> => []),
            assertLinkHostsPublic: vi.fn(async () => undefined),
            forFeed: vi.fn((stickers: unknown[] = []) => stickers),
            mentionNames: vi.fn(async () => new Map()),
            blockedLinkDomains: vi.fn(async () => new Set(['evil.example'])),
          },
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
    describe('a video story and its painted layer', () => {
      const video = 'https://cdn.example.com/circlesfera/v.mp4';
      const layer = 'https://cdn.example.com/circlesfera/l.png';

      it('takes a video only from its own storage', async () => {
        mockUploadsService.ownsUrl.mockImplementation(
          (url: string) => url !== video,
        );

        await expect(
          service.create('user-1', { url: video, mediaType: 'video' }),
        ).rejects.toThrow('STORY_MEDIA_NOT_OURS');
        expect(mockPrismaService.story.create).not.toHaveBeenCalled();
      });

      it('takes a layer only on a video, and only from its own storage', async () => {
        await expect(
          service.create('user-1', { url: 'p.jpg', overlayUrl: layer }),
        ).rejects.toThrow('STORY_OVERLAY_ONLY_ON_VIDEO');

        mockUploadsService.ownsUrl.mockImplementation(
          (url: string) => url !== layer,
        );
        await expect(
          service.create('user-1', {
            url: video,
            mediaType: 'video',
            overlayUrl: layer,
          }),
        ).rejects.toThrow('STORY_MEDIA_NOT_OURS');
        expect(mockPrismaService.story.create).not.toHaveBeenCalled();
      });

      it('keeps the layer, has it joined to the video, and has it moderated too', async () => {
        mockPrismaService.story.create.mockResolvedValueOnce({
          id: 'story-vid',
          url: video,
          mediaType: 'video',
          overlayUrl: layer,
          thumbnailUrl: null,
        } as unknown as Story);

        await service.create('user-1', {
          url: video,
          mediaType: 'video',
          overlayUrl: layer,
        });

        expect(mockPrismaService.story.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ url: video, overlayUrl: layer }),
          }),
        );
        expect(mockUploadsService.enqueueStoryOverlay).toHaveBeenCalledWith(
          'story-vid',
        );
        expect(mockAiQueue.add).toHaveBeenCalledWith(
          'moderate-content',
          expect.objectContaining({ mediaUrls: [video, layer] }),
        );
      });

      it('joins nothing for a story without a layer', async () => {
        mockPrismaService.story.create.mockResolvedValueOnce({
          id: 'story-vid',
          url: video,
          mediaType: 'video',
          overlayUrl: null,
        } as unknown as Story);

        await service.create('user-1', { url: video, mediaType: 'video' });

        expect(mockPrismaService.story.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ overlayUrl: null }),
          }),
        );
        expect(mockUploadsService.enqueueStoryOverlay).not.toHaveBeenCalled();
      });
    });

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
        'El precio de la historia premium debe estar entre €3.00 y €500.00.',
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

    it('saves the stickers of the story in the same transaction', async () => {
      const stickers = module.get(StoryStickersService);
      mockPrismaService.story.create.mockResolvedValue({
        id: 'story-1',
        url: 'https://cdn.example.com/story.png',
      } as unknown as Story);
      const poll = {
        kind: 'POLL' as const,
        settings: { question: 'Q', options: ['a', 'b'] },
        x: 0,
        y: -0.2,
        scale: 1,
        rotation: 0,
      };

      await service.create('user-1', {
        url: 'https://cdn.example.com/story.png',
        stickers: [poll],
      });

      expect(stickers.createForStory).toHaveBeenCalledWith(
        expect.anything(),
        'story-1',
        'user-1',
        [poll],
        null,
      );
    });

    it('checks the hosts of its links before the transaction opens', async () => {
      const stickers = module.get(StoryStickersService);
      const link = {
        kind: 'LINK' as const,
        settings: { url: 'https://shop.example.com' },
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      };
      vi.mocked(stickers.assertLinkHostsPublic).mockRejectedValueOnce(
        new Error('LINK_HOST_NOT_ALLOWED'),
      );
      const before = mockPrismaService.$transaction.mock.calls.length;

      await expect(
        service.create('user-1', {
          url: 'https://cdn.example.com/story.png',
          stickers: [link],
        }),
      ).rejects.toThrow('LINK_HOST_NOT_ALLOWED');

      expect(stickers.assertLinkHostsPublic).toHaveBeenCalledWith([link]);
      expect(mockPrismaService.$transaction.mock.calls.length).toBe(before);
    });

    describe('a mention on the story', () => {
      const mentionOf = (profileId: string) => ({
        kind: 'MENTION' as const,
        settings: { profileId },
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      });

      beforeEach(() => {
        mockPrismaService.story.create.mockResolvedValue({
          id: 'story-1',
          url: 'https://cdn.example.com/story.png',
        } as unknown as Story);
      });

      it('tells the person mentioned, linked to the story, when they can see it', async () => {
        const stickers = module.get(StoryStickersService);
        vi.mocked(stickers.createForStory).mockResolvedValueOnce(['p-ana']);
        mockPrismaService.story.findUnique.mockResolvedValueOnce({
          profileId: 'user-1',
          expiresAt: new Date(Date.now() + 3_600_000),
          isCloseFriendsOnly: false,
          profile: { privacyLevel: 'PUBLIC' },
        });

        await service.create('user-1', {
          url: 'https://cdn.example.com/story.png',
          stickers: [mentionOf('p-ana')],
        });

        expect(eventEmitter.emit).toHaveBeenCalledWith('notification.create', {
          recipientId: 'p-ana',
          senderId: 'user-1',
          type: 'MENTION',
          notice: { key: 'mentioned_in_story' },
          targetType: 'story',
          targetId: 'story-1',
        });
      });

      it('tells no one who cannot see the story', async () => {
        const stickers = module.get(StoryStickersService);
        vi.mocked(stickers.createForStory).mockResolvedValueOnce(['p-out']);
        // Close friends only, and the person is not on the list.
        mockPrismaService.story.findUnique.mockResolvedValueOnce({
          profileId: 'user-1',
          expiresAt: new Date(Date.now() + 3_600_000),
          isCloseFriendsOnly: true,
          profile: { privacyLevel: 'PUBLIC' },
        });
        mockPrismaService.closeFriend.findUnique.mockResolvedValueOnce(null);

        await service.create('user-1', {
          url: 'https://cdn.example.com/story.png',
          stickers: [mentionOf('p-out')],
        });

        expect(eventEmitter.emit).not.toHaveBeenCalledWith(
          'notification.create',
          expect.anything(),
        );
      });

      it('tells no one while the story is scheduled', async () => {
        const stickers = module.get(StoryStickersService);
        vi.mocked(stickers.createForStory).mockResolvedValueOnce(['p-ana']);

        await service.create('user-1', {
          url: 'https://cdn.example.com/story.png',
          scheduledAt: new Date(Date.now() + 1_000_000),
          stickers: [mentionOf('p-ana')],
        });

        expect(eventEmitter.emit).not.toHaveBeenCalled();
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

    it('creates a linked Media row as PENDING for a video with no standardUrl yet, and returns its status', async () => {
      mockPrismaService.media.create.mockResolvedValueOnce({
        id: 'media-pending-1',
      });
      mockPrismaService.story.create.mockResolvedValueOnce({
        id: 'story-vid',
        url: 'https://cdn.example.com/story.mp4',
        mediaType: 'video',
        media: {
          url: 'https://cdn.example.com/story.mp4',
          standardUrl: null,
          thumbnailUrl: null,
          status: 'PENDING',
        },
      } as unknown as Story);

      const result = await service.create('user-1', {
        url: 'https://cdn.example.com/story.mp4',
        mediaType: 'video',
      });

      expect(mockPrismaService.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'VIDEO',
          status: 'PENDING',
          url: 'https://cdn.example.com/story.mp4',
        }),
      });
      expect(mockPrismaService.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mediaId: 'media-pending-1' }),
        }),
      );
      expect((result as unknown as { status: string }).status).toBe('PENDING');
    });
  });

  describe('findAll', () => {
    it('takes the links off a story while its author is banned or suspended, and passes the blocked domains', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      const later = new Date(Date.now() + 3_600_000);
      mockPrismaService.story.findMany.mockResolvedValue([
        { id: 's-ok', profileId: 'user-2', profile: { suspendedUntil: null } },
        {
          id: 's-ban',
          profileId: 'user-2',
          profile: { isAccountBanned: true },
        },
        {
          id: 's-sus',
          profileId: 'user-2',
          profile: { suspendedUntil: later },
        },
      ]);
      const stickers = module.get(StoryStickersService);

      await service.findAll('user-1');

      const passed = vi
        .mocked(stickers.forFeed)
        .mock.calls.map((call) => call[2]);
      expect(passed.map((n) => n?.linksOff)).toEqual([false, true, true]);
      expect(passed[0]?.blockedDomains).toEqual(new Set(['evil.example']));
    });

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

    it('sends each story with its stickers, and its first poll and question as apps already installed read them', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      const poll = {
        id: 'st-poll',
        kind: 'POLL',
        settings: { question: 'Q', options: ['a', 'b'] },
        x: 0.1,
        y: -0.2,
        scale: 1,
        rotation: 5,
      };
      const tag = {
        ...poll,
        id: 'st-tag',
        kind: 'HASHTAG',
        settings: { tag: 'a' },
      };
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 's-1',
          profileId: 'user-2',
          isCloseFriendsOnly: false,
          stickers: [tag, poll],
        },
      ]);

      const [story] = (await service.findAll('user-1')) as any[];

      expect(story.stickers).toEqual([tag, poll]);
      expect(story.poll).toEqual({
        id: 'st-poll',
        stickerX: 0.1,
        stickerY: -0.2,
        stickerScale: 1,
        stickerRotation: 5,
      });
      expect(story.qnaBox).toBeNull();
    });

    it('names the people mentioned and the place of each story, for the viewer', async () => {
      const stickers = module.get(StoryStickersService);
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      const mention = { id: 'st-m', kind: 'MENTION', settings: {} };
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 's-1',
          profileId: 'user-2',
          isCloseFriendsOnly: false,
          place: { name: 'Madrid' },
          stickers: [mention],
        },
        { id: 's-2', profileId: 'user-2', isCloseFriendsOnly: false },
      ]);
      const usernames = new Map([['p-ana', 'ana']]);
      vi.mocked(stickers.mentionNames).mockResolvedValueOnce(usernames);

      await service.findAll('user-1');

      expect(stickers.mentionNames).toHaveBeenCalledWith([mention], 'user-1');
      expect(stickers.forFeed).toHaveBeenCalledWith([mention], false, {
        usernames,
        placeName: 'Madrid',
        blockedDomains: expect.any(Set),
        linksOff: false,
      });
      expect(stickers.forFeed).toHaveBeenCalledWith([], false, {
        usernames,
        placeName: null,
        blockedDomains: expect.any(Set),
        linksOff: false,
      });
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
    const publicStory = {
      profileId: 'author-1',
      isCloseFriendsOnly: false,
      profile: { privacyLevel: 'PUBLIC' },
    };

    beforeEach(() => {
      mockPrismaService.story.findUnique.mockResolvedValue(publicStory);
    });

    it('rejects views across a block, and on close-friends stories for non-members', async () => {
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b1' });
      await expect(service.view('story-1', 'viewer-1')).rejects.toThrow(
        NotFoundException,
      );

      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        ...publicStory,
        isCloseFriendsOnly: true,
      });
      await expect(service.view('story-1', 'viewer-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.storyView.create).not.toHaveBeenCalled();
    });

    it('answers NotFound for a missing story', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue(null);

      await expect(service.view('story-1', 'viewer-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.storyView.create).not.toHaveBeenCalled();
    });

    it('lets the author view their own close-friends story without access checks', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue({
        ...publicStory,
        isCloseFriendsOnly: true,
      });
      mockPrismaService.storyView.findUnique.mockResolvedValue(null);
      mockPrismaService.storyView.create.mockResolvedValue({ id: 'view-1' });

      const result = await service.view('story-1', 'author-1');

      expect(result.id).toBe('view-1');
      expect(mockPrismaService.block.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.closeFriend.findUnique).not.toHaveBeenCalled();
    });

    it('requires an accepted follow to view a private account story', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue({
        ...publicStory,
        profile: { privacyLevel: 'PRIVATE' },
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'PENDING',
      });
      await expect(service.view('story-1', 'viewer-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.storyView.create).not.toHaveBeenCalled();

      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'ACCEPTED',
      });
      mockPrismaService.storyView.findUnique.mockResolvedValue(null);
      mockPrismaService.storyView.create.mockResolvedValue({ id: 'view-1' });

      const result = await service.view('story-1', 'viewer-1');

      expect(result.id).toBe('view-1');
      expect(mockPrismaService.follow.findUnique).toHaveBeenCalledWith({
        where: {
          followerId_followingId: {
            followerId: 'viewer-1',
            followingId: 'author-1',
          },
        },
        select: { status: true },
      });
    });

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
        overlayUrl: 'https://cdn.example.com/s-layer.png',
      });
      mockUploadsService.deleteFile.mockRejectedValue(new Error('S3 error'));
      mockPrismaService.story.delete.mockResolvedValue({});

      await service.delete('story-1');

      // A layer not yet joined goes with the story.
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/s-layer.png',
      );

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
        privacyLevel: 'PUBLIC',
        user: {},
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
        privacyLevel: 'PRIVATE',
        user: {},
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
    it('should return public-safe viewer profiles, never the raw User record', async () => {
      mockPrismaService.storyView.findMany.mockResolvedValue([
        {
          id: 'sv1',
          createdAt: new Date('2026-01-01'),
          viewer: {
            id: 'profile-1',
            username: 'alice',
            fullName: 'Alice A',
            avatar: 'a.jpg',
            standardUrl: null,
            thumbnailUrl: null,
            verificationLevel: 'BASIC',
            accountType: 'PERSONAL',
          },
        },
      ]);
      const result = await service.getViews('s1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('profile-1');
      expect(result.data[0].profile.username).toBe('alice');
      expect(result.data[0].verificationLevel).toBe('BASIC');
      expect(result.data[0]).not.toHaveProperty('password');
      expect(result.data[0].profile).not.toHaveProperty('user');
      expect(result.nextCursor).toBeUndefined();
      expect(mockPrismaService.storyView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            viewer: {
              select: expect.objectContaining({
                id: true,
                username: true,
                verificationLevel: true,
                accountType: true,
              }),
            },
          },
        }),
      );
    });

    it('should decode an opaque cursor into a keyset WHERE clause without any DB lookup, and cap the limit at 100', async () => {
      mockPrismaService.storyView.findMany.mockResolvedValue([]);
      const cursor = encodeKeysetCursor({
        createdAt: new Date('2026-01-05'),
        id: 'sv5',
      });

      await service.getViews('s1', cursor, 500);

      expect(mockPrismaService.storyView.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.storyView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 101,
          where: expect.objectContaining({
            storyId: 's1',
            OR: [
              { createdAt: { lt: new Date('2026-01-05') } },
              { createdAt: new Date('2026-01-05'), id: { lt: 'sv5' } },
            ],
          }),
        }),
      );
    });

    it('should degrade to the first page for a malformed or stale cursor', async () => {
      mockPrismaService.storyView.findMany.mockResolvedValue([]);

      await service.getViews('s1', 'stale-cursor');

      expect(mockPrismaService.storyView.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.storyView.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storyId: 's1' } }),
      );
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
    beforeEach(() => {
      mockPrismaService.story.findUnique.mockResolvedValue({
        profileId: 'author-1',
        isCloseFriendsOnly: false,
        profile: { privacyLevel: 'PUBLIC' },
      });
      mockPrismaService.block.findFirst.mockResolvedValue(null);
      mockPrismaService.story.count.mockResolvedValue(1);
    });

    it('answers not found to another viewer for a story that is scheduled or taken down', async () => {
      mockPrismaService.storyReaction.findMany.mockClear();
      mockPrismaService.story.count.mockResolvedValueOnce(0);

      await expect(service.getReactions('s1', 'viewer-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.story.count).toHaveBeenLastCalledWith({
        where: {
          id: 's1',
          moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
          scheduledStatus: 'PUBLISHED',
        },
      });
      expect(mockPrismaService.storyReaction.findMany).not.toHaveBeenCalled();
    });

    it('gives the author every reaction and another viewer only their own', async () => {
      mockPrismaService.storyReaction.findMany.mockResolvedValue([]);

      await service.getReactions('s1', 'author-1');
      expect(
        mockPrismaService.storyReaction.findMany.mock.lastCall?.[0].where,
      ).toEqual({ storyId: 's1' });

      await service.getReactions('s1', 'viewer-1');
      expect(
        mockPrismaService.storyReaction.findMany.mock.lastCall?.[0].where,
      ).toEqual({ storyId: 's1', profileId: 'viewer-1' });
    });

    it('answers not found, and reads no reaction, for a story the viewer cannot see', async () => {
      mockPrismaService.storyReaction.findMany.mockClear();
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b1' });

      await expect(service.getReactions('s1', 'viewer-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrismaService.storyReaction.findMany).not.toHaveBeenCalled();
    });

    it('should return reactions with public-safe reactor profiles, never the raw User record', async () => {
      mockPrismaService.storyReaction.findMany.mockResolvedValue([
        {
          id: 'r1',
          profileId: 'profile-1',
          reaction: '❤️',
          profile: {
            id: 'profile-1',
            username: 'alice',
            fullName: 'Alice A',
            avatar: 'a.jpg',
            standardUrl: null,
            thumbnailUrl: null,
            verificationLevel: 'BASIC',
            accountType: 'PERSONAL',
          },
        },
      ]);
      const result = await service.getReactions('s1', 'author-1');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].profile.username).toBe('alice');
      expect(result.data[0].profile).not.toHaveProperty('user');
      expect(result.data[0].profile).not.toHaveProperty('password');
      expect(result.nextCursor).toBeUndefined();
      expect(mockPrismaService.storyReaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            profile: {
              select: expect.objectContaining({
                id: true,
                username: true,
                verificationLevel: true,
                accountType: true,
              }),
            },
          },
        }),
      );
    });

    it('should decode an opaque cursor into a keyset WHERE clause without any DB lookup', async () => {
      mockPrismaService.storyReaction.findMany.mockResolvedValue([]);
      const cursor = encodeKeysetCursor({
        createdAt: new Date('2026-01-05'),
        id: 'r5',
      });

      await service.getReactions('s1', 'author-1', cursor);

      expect(mockPrismaService.storyReaction.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.storyReaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            storyId: 's1',
            OR: [
              { createdAt: { lt: new Date('2026-01-05') } },
              { createdAt: new Date('2026-01-05'), id: { lt: 'r5' } },
            ],
          }),
        }),
      );
    });

    it('should degrade to the first page for a malformed or stale cursor', async () => {
      mockPrismaService.storyReaction.findMany.mockResolvedValue([]);

      await service.getReactions('s1', 'author-1', 'stale-cursor');

      expect(mockPrismaService.storyReaction.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.storyReaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storyId: 's1' } }),
      );
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
          overlayUrl: 'https://cdn.example.com/exp-layer.png',
        },
      ]);
      mockUploadsService.deleteFile.mockRejectedValue(new Error('fail'));
      mockPrismaService.story.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.cleanupExpiredStories();
      expect(result).toEqual({ count: 1 });
      // A story whose countdown is still to be told is kept, hidden.
      for (const call of [
        mockPrismaService.story.findMany.mock.calls.at(-1),
        mockPrismaService.story.deleteMany.mock.calls.at(-1),
      ]) {
        expect(call?.[0].where.stickers).toEqual({
          none: { kind: 'COUNTDOWN', announcedAt: null },
        });
      }
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/exp-layer.png',
      );
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
