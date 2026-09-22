import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ModerationStatus, NotificationType } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemModeratorActor } from '../../admin/utils/resolve-admin-notification-sender.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AIService } from '../ai.service.js';
import { AIProcessor } from './ai.processor.js';

vi.mock('../../admin/utils/resolve-admin-notification-sender.js', () => ({
  resolveSystemModeratorActor: vi.fn(),
}));

describe('AIProcessor', () => {
  let processor: AIProcessor;
  let aiService: {
    generateEmbedding: ReturnType<typeof vi.fn>;
    moderateContent: ReturnType<typeof vi.fn>;
    generateAltText: ReturnType<typeof vi.fn>;
    transcribeAudio: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    post: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    story: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    comment: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    postMedia: { update: ReturnType<typeof vi.fn> };
    profile: { findUnique: ReturnType<typeof vi.fn> };
    user: { update: ReturnType<typeof vi.fn> };
    report: { create: ReturnType<typeof vi.fn> };
    $executeRaw: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };
  let eventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    aiService = {
      generateEmbedding: vi.fn(),
      moderateContent: vi.fn(),
      generateAltText: vi.fn(),
      transcribeAudio: vi.fn(),
    };

    prisma = {
      post: { findUnique: vi.fn(), update: vi.fn() },
      story: { findUnique: vi.fn(), update: vi.fn() },
      comment: { findUnique: vi.fn(), update: vi.fn() },
      postMedia: { update: vi.fn() },
      profile: { findUnique: vi.fn() },
      user: { update: vi.fn() },
      report: { create: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIProcessor,
        { provide: AIService, useValue: aiService },
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    processor = module.get<AIProcessor>(AIProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process switch routing', () => {
    it('throws UnrecoverableError for unknown job name', async () => {
      const job = { name: 'invalid-job', data: {} } as Job;
      await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
      await expect(processor.process(job)).rejects.toThrow(
        /Unknown job name in ai queue/,
      );
    });
  });

  describe('transcribe-edit-clip', () => {
    it('throws UnrecoverableError if mediaUrl is missing', async () => {
      const job = { name: 'transcribe-edit-clip', data: {} } as Job;
      await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
    });

    it('transcribes audio and returns segments successfully', async () => {
      const job = {
        id: 'job-1',
        name: 'transcribe-edit-clip',
        data: { mediaUrl: 'https://cdn.example.com/clip.mp4' },
      } as Job;

      const segments = [{ start: 0, end: 5, text: 'Hello' }];
      aiService.transcribeAudio.mockResolvedValue(segments);

      const result = await processor.process(job);
      expect(result).toEqual({ segments });
      expect(aiService.transcribeAudio).toHaveBeenCalledWith(
        'https://cdn.example.com/clip.mp4',
      );
    });

    it('catches and rethrows Error instance with logging', async () => {
      const job = {
        id: 'job-1',
        name: 'transcribe-edit-clip',
        data: { mediaUrl: 'https://cdn.example.com/clip.mp4' },
      } as Job;

      aiService.transcribeAudio.mockRejectedValue(new Error('Whisper timeout'));

      await expect(processor.process(job)).rejects.toThrow('Whisper timeout');
    });

    it('catches and rethrows non-Error instance with logging', async () => {
      const job = {
        id: 'job-1',
        name: 'transcribe-edit-clip',
        data: { mediaUrl: 'https://cdn.example.com/clip.mp4' },
      } as Job;

      aiService.transcribeAudio.mockRejectedValue('Fatal network error');

      await expect(processor.process(job)).rejects.toBe('Fatal network error');
    });
  });

  describe('generate-alt-text', () => {
    it('throws UnrecoverableError when postId is missing', async () => {
      const job = { name: 'generate-alt-text', data: {} } as Job;
      await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
    });

    it('throws UnrecoverableError when post is not found', async () => {
      const job = { name: 'generate-alt-text', data: { postId: 'p-1' } } as Job;
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
      await expect(processor.process(job)).rejects.toThrow(/Post not found/);
    });

    it('returns early if post has no media', async () => {
      const job = { name: 'generate-alt-text', data: { postId: 'p-1' } } as Job;
      prisma.post.findUnique.mockResolvedValue({ id: 'p-1', media: [] });

      await processor.process(job);
      expect(aiService.generateAltText).not.toHaveBeenCalled();
    });

    it('generates alt text for image media missing altText', async () => {
      const job = { name: 'generate-alt-text', data: { postId: 'p-1' } } as Job;
      prisma.post.findUnique.mockResolvedValue({
        id: 'p-1',
        media: [
          {
            id: 'm-1',
            type: 'image',
            url: 'http://img1.jpg',
            standardUrl: null,
            altText: null,
          },
          {
            id: 'm-2',
            type: 'image',
            url: 'http://img2.jpg',
            standardUrl: 'http://img2-std.jpg',
            altText: null,
          },
          { id: 'm-3', type: 'video', url: 'http://vid.mp4', altText: null },
          {
            id: 'm-4',
            type: 'image',
            url: 'http://img4.jpg',
            altText: 'Already has text',
          },
        ],
      });

      aiService.generateAltText.mockResolvedValueOnce('Description 1');
      aiService.generateAltText.mockResolvedValueOnce('Description 2');

      await processor.process(job);

      expect(aiService.generateAltText).toHaveBeenCalledTimes(2);
      expect(aiService.generateAltText).toHaveBeenNthCalledWith(
        1,
        'http://img1.jpg',
      );
      expect(aiService.generateAltText).toHaveBeenNthCalledWith(
        2,
        'http://img2-std.jpg',
      );

      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { altText: 'Description 1' },
      });
      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'm-2' },
        data: { altText: 'Description 2' },
      });
    });

    it('catches and rethrows errors in alt-text generation', async () => {
      const job = { name: 'generate-alt-text', data: { postId: 'p-1' } } as Job;
      prisma.post.findUnique.mockRejectedValue(new Error('DB failure'));

      await expect(processor.process(job)).rejects.toThrow('DB failure');
    });
  });

  describe('generate-embedding', () => {
    it('throws UnrecoverableError when postId or text is missing', async () => {
      await expect(
        processor.process({
          name: 'generate-embedding',
          data: { text: 'hi' },
        } as Job),
      ).rejects.toThrow(UnrecoverableError);

      await expect(
        processor.process({
          name: 'generate-embedding',
          data: { postId: 'p-1' },
        } as Job),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('generates embedding and updates database', async () => {
      const job = {
        name: 'generate-embedding',
        data: { postId: 'p-1', text: 'Some cool post text' },
      } as Job;

      aiService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      prisma.$executeRaw.mockResolvedValue(1);

      await processor.process(job);

      expect(aiService.generateEmbedding).toHaveBeenCalledWith(
        'Some cool post text',
      );
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('catches and rethrows Error instance on failure', async () => {
      const job = {
        name: 'generate-embedding',
        data: { postId: 'p-1', text: 'Some text' },
      } as Job;

      aiService.generateEmbedding.mockRejectedValue(
        new Error('Embedding fail'),
      );

      await expect(processor.process(job)).rejects.toThrow('Embedding fail');
    });

    it('catches and rethrows non-Error instance on failure', async () => {
      const job = {
        name: 'generate-embedding',
        data: { postId: 'p-1', text: 'Some text' },
      } as Job;

      aiService.generateEmbedding.mockRejectedValue('String error');

      await expect(processor.process(job)).rejects.toBe('String error');
    });
  });

  describe('generate-profile-embedding', () => {
    it('throws UnrecoverableError when profileId or text is missing', async () => {
      await expect(
        processor.process({
          name: 'generate-profile-embedding',
          data: { text: 'bio' },
        } as Job),
      ).rejects.toThrow(UnrecoverableError);

      await expect(
        processor.process({
          name: 'generate-profile-embedding',
          data: { profileId: 'prof-1' },
        } as Job),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('generates profile embedding and updates database', async () => {
      const job = {
        name: 'generate-profile-embedding',
        data: { profileId: 'prof-1', text: 'My cool bio' },
      } as Job;

      aiService.generateEmbedding.mockResolvedValue([0.5, 0.6]);
      prisma.$executeRaw.mockResolvedValue(1);

      await processor.process(job);

      expect(aiService.generateEmbedding).toHaveBeenCalledWith('My cool bio');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('catches and rethrows Error instance on failure', async () => {
      const job = {
        name: 'generate-profile-embedding',
        data: { profileId: 'prof-1', text: 'bio' },
      } as Job;

      aiService.generateEmbedding.mockRejectedValue(
        new Error('Profile embedding fail'),
      );

      await expect(processor.process(job)).rejects.toThrow(
        'Profile embedding fail',
      );
    });

    it('catches and rethrows non-Error instance on failure', async () => {
      const job = {
        name: 'generate-profile-embedding',
        data: { profileId: 'prof-1', text: 'bio' },
      } as Job;

      aiService.generateEmbedding.mockRejectedValue('Non-error fail');

      await expect(processor.process(job)).rejects.toBe('Non-error fail');
    });
  });

  describe('moderate-content', () => {
    it('throws UnrecoverableError when targetId or targetType is missing', async () => {
      await expect(
        processor.process({
          name: 'moderate-content',
          data: { targetType: 'POST' },
        } as Job),
      ).rejects.toThrow(UnrecoverableError);

      await expect(
        processor.process({
          name: 'moderate-content',
          data: { targetId: 't-1' },
        } as Job),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('fetches media URLs for POST when not provided', async () => {
      const job = {
        name: 'moderate-content',
        data: { targetId: 'p-1', targetType: 'POST', text: 'Clean text' },
      } as Job;

      prisma.post.findUnique.mockResolvedValue({
        id: 'p-1',
        media: [
          { url: 'http://img1.png', thumbnailUrl: null },
          { url: 'http://img2.png', thumbnailUrl: 'http://thumb2.png' },
        ],
      });

      aiService.generateEmbedding.mockResolvedValue([0.1]);
      prisma.$queryRaw.mockResolvedValue([]); // No firewall match
      aiService.moderateContent.mockResolvedValue({
        flagged: false,
        categories: {},
        category_scores: {},
      });

      await processor.process(job);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        include: { media: true },
      });
      expect(aiService.moderateContent).toHaveBeenCalledWith('Clean text', [
        'http://img1.png',
        'http://thumb2.png',
      ]);
    });

    it('fetches media URLs for STORY when not provided', async () => {
      const job = {
        name: 'moderate-content',
        data: { targetId: 's-1', targetType: 'STORY', text: 'Story caption' },
      } as Job;

      prisma.story.findUnique.mockResolvedValue({
        id: 's-1',
        url: 'http://story.png',
        thumbnailUrl: null,
      });

      aiService.generateEmbedding.mockResolvedValue([0.1]);
      prisma.$queryRaw.mockResolvedValue([]);
      aiService.moderateContent.mockResolvedValue({
        flagged: false,
        categories: {},
        category_scores: {},
      });

      await processor.process(job);

      expect(prisma.story.findUnique).toHaveBeenCalledWith({
        where: { id: 's-1' },
      });
      expect(aiService.moderateContent).toHaveBeenCalledWith('Story caption', [
        'http://story.png',
      ]);
    });

    it('fetches media URLs for COMMENT when not provided', async () => {
      const job = {
        name: 'moderate-content',
        data: { targetId: 'c-1', targetType: 'COMMENT', text: 'Comment text' },
      } as Job;

      prisma.comment.findUnique.mockResolvedValue({
        id: 'c-1',
        url: 'http://comment-media.png',
      });

      aiService.generateEmbedding.mockResolvedValue([0.1]);
      prisma.$queryRaw.mockResolvedValue([]);
      aiService.moderateContent.mockResolvedValue({
        flagged: false,
        categories: {},
        category_scores: {},
      });

      await processor.process(job);

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({
        where: { id: 'c-1' },
      });
      expect(aiService.moderateContent).toHaveBeenCalledWith('Comment text', [
        'http://comment-media.png',
      ]);
    });

    it('triggers Vector Firewall and blocks content early without calling OpenAI', async () => {
      const job = {
        name: 'moderate-content',
        data: { targetId: 'p-bad', targetType: 'POST', text: 'very bad text' },
      } as Job;

      aiService.generateEmbedding.mockResolvedValue([0.9, 0.9]);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'sig-1', category: 'hate', similarity: 0.95 },
      ]);

      prisma.post.update.mockResolvedValue({ profileId: 'author-prof-1' });
      (resolveSystemModeratorActor as any).mockResolvedValue({
        userId: 'admin-user-1',
        profileId: 'admin-prof-1',
      });

      prisma.profile.findUnique.mockResolvedValue({ userId: 'u-bad' });
      prisma.user.update.mockResolvedValue({ id: 'u-bad', strikeCount: 3 });

      await processor.process(job);

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p-bad' },
        data: {
          moderationStatus: ModerationStatus.HIDDEN,
          moderationNote: expect.stringContaining('[AI Vector Firewall]'),
        },
        select: { profileId: true },
      });

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: 'admin-prof-1',
          targetType: 'POST',
          targetId: 'p-bad',
          reason: 'OTHER',
          details: expect.stringContaining('[AI Vector Firewall]'),
        },
      });

      // Escalation report because strikeCount >= 3
      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: 'admin-prof-1',
          targetType: 'USER',
          targetId: 'u-bad',
          reason: 'OTHER',
          details: expect.stringContaining('[URGENT]'),
        },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('notification.create', {
        recipientId: 'author-prof-1',
        senderId: 'admin-prof-1',
        type: NotificationType.MODERATION,
        content: expect.stringContaining('was hidden by automated moderation'),
        postId: 'p-bad',
      });

      expect(aiService.moderateContent).not.toHaveBeenCalled();
    });

    it('handles Vector Firewall trigger when no system operator actor exists', async () => {
      const job = {
        name: 'moderate-content',
        data: {
          targetId: 's-bad',
          targetType: 'STORY',
          text: 'story bad text',
        },
      } as Job;

      aiService.generateEmbedding.mockResolvedValue([0.9]);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'sig-1', category: 'hate', similarity: 0.92 },
      ]);
      prisma.story.update.mockResolvedValue({ profileId: 'author-prof-2' });
      (resolveSystemModeratorActor as any).mockResolvedValue(null);

      await processor.process(job);

      expect(prisma.story.update).toHaveBeenCalled();
      expect(prisma.report.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('handles Vector Firewall trigger for COMMENT with non-existent author profile', async () => {
      const job = {
        name: 'moderate-content',
        data: { targetId: 'c-bad', targetType: 'COMMENT', text: 'comment bad' },
      } as Job;

      aiService.generateEmbedding.mockResolvedValue([0.9]);
      prisma.$queryRaw.mockResolvedValue([
        { id: 'sig-1', category: 'violence', similarity: 0.99 },
      ]);
      prisma.comment.update.mockResolvedValue({ profileId: null });
      (resolveSystemModeratorActor as any).mockResolvedValue({
        userId: 'admin-u-1',
        profileId: 'admin-prof-1',
      });

      await processor.process(job);

      expect(prisma.comment.update).toHaveBeenCalled();
      expect(prisma.report.create).toHaveBeenCalledTimes(1); // Only the target report, no strike or notification
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('moderates content via OpenAI, flagging without hiding when no severe category', async () => {
      const job = {
        name: 'moderate-content',
        data: {
          targetId: 'p-flagged',
          targetType: 'POST',
          text: 'some questionable text',
        },
      } as Job;

      prisma.post.findUnique.mockResolvedValue({ id: 'p-flagged', media: [] });
      aiService.generateEmbedding.mockResolvedValue([0.1]);
      prisma.$queryRaw.mockResolvedValue([]); // firewall clean

      aiService.moderateContent.mockResolvedValue({
        flagged: true,
        categories: { illicit: true },
        category_scores: { illicit: 0.8 },
      });

      prisma.post.update.mockResolvedValue({ profileId: 'author-prof-3' });
      (resolveSystemModeratorActor as any).mockResolvedValue({
        userId: 'admin-1',
        profileId: 'admin-prof-1',
      });
      prisma.profile.findUnique.mockResolvedValue({ userId: 'u-1' });
      prisma.user.update.mockResolvedValue({ id: 'u-1', strikeCount: 1 });

      await processor.process(job);

      // Signature inserted into firewall
      expect(prisma.$executeRaw).toHaveBeenCalled();

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p-flagged' },
        data: {
          moderationStatus: ModerationStatus.FLAGGED,
          moderationNote: expect.stringContaining('illicit'),
        },
        select: { profileId: true },
      });

      // No strike applied for non-severe flag (applyStrike: false)
      expect(prisma.user.update).not.toHaveBeenCalled();

      expect(eventEmitter.emit).toHaveBeenCalledWith('notification.create', {
        recipientId: 'author-prof-3',
        senderId: 'admin-prof-1',
        type: NotificationType.MODERATION,
        content: expect.stringContaining('was flagged for review'),
        postId: 'p-flagged',
      });
    });

    it('handles failure when inserting bad embedding to vector firewall gracefully', async () => {
      const job = {
        name: 'moderate-content',
        data: {
          targetId: 'p-flagged-2',
          targetType: 'POST',
          text: 'violating words',
        },
      } as Job;

      prisma.post.findUnique.mockResolvedValue({
        id: 'p-flagged-2',
        media: [],
      });
      aiService.generateEmbedding.mockResolvedValue([0.1]);
      prisma.$queryRaw.mockResolvedValue([]);

      aiService.moderateContent.mockResolvedValue({
        flagged: true,
        categories: { sexual: true },
        category_scores: { sexual: 0.99 },
      });

      // Cause $executeRaw to fail on signature insertion
      prisma.$executeRaw.mockRejectedValue(
        new Error('Unique violation in signatures'),
      );

      prisma.post.update.mockResolvedValue({ profileId: 'author-prof-4' });
      (resolveSystemModeratorActor as any).mockResolvedValue({
        userId: 'admin-1',
        profileId: 'admin-prof-1',
      });
      prisma.profile.findUnique.mockResolvedValue({ userId: 'u-2' });
      prisma.user.update.mockResolvedValue({ id: 'u-2', strikeCount: 1 });

      // Should not throw, should continue to hide and notify
      await processor.process(job);

      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'p-flagged-2' },
        data: {
          moderationStatus: ModerationStatus.HIDDEN,
          moderationNote: expect.stringContaining('sexual'),
        },
        select: { profileId: true },
      });
    });

    it('tests all shouldHide categories: harassment, violence, self-harm, sexual/minors', async () => {
      for (const cat of [
        'harassment',
        'violence',
        'self-harm',
        'sexual/minors',
      ] as const) {
        const job = {
          name: 'moderate-content',
          data: {
            targetId: `s-${cat}`,
            targetType: 'STORY',
            text: 'test text',
          },
        } as Job;

        prisma.story.findUnique.mockResolvedValue({
          id: `s-${cat}`,
          url: 'http://img.png',
        });
        aiService.generateEmbedding.mockResolvedValue([0.1]);
        prisma.$queryRaw.mockResolvedValue([]);

        aiService.moderateContent.mockResolvedValue({
          flagged: true,
          categories: { [cat]: true },
          category_scores: { [cat]: 0.95 },
        });

        prisma.story.update.mockResolvedValue({ profileId: 'author-prof-5' });
        (resolveSystemModeratorActor as any).mockResolvedValue({
          userId: 'admin-1',
          profileId: 'admin-prof-1',
        });
        prisma.profile.findUnique.mockResolvedValue({ userId: 'u-5' });
        prisma.user.update.mockResolvedValue({ id: 'u-5', strikeCount: 1 });

        await processor.process(job);

        expect(prisma.story.update).toHaveBeenCalledWith({
          where: { id: `s-${cat}` },
          data: {
            moderationStatus: ModerationStatus.HIDDEN,
            moderationNote: expect.stringContaining(cat),
          },
          select: { profileId: true },
        });

        // For STORY, postId should be undefined
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'notification.create',
          expect.objectContaining({
            postId: undefined,
          }),
        );
      }
    });

    it('handles author profile not found during applyStrike', async () => {
      const job = {
        name: 'moderate-content',
        data: { targetId: 'p-orphaned', targetType: 'POST', text: 'bad words' },
      } as Job;

      prisma.post.findUnique.mockResolvedValue({ id: 'p-orphaned', media: [] });
      aiService.generateEmbedding.mockResolvedValue([0.1]);
      prisma.$queryRaw.mockResolvedValue([]);

      aiService.moderateContent.mockResolvedValue({
        flagged: true,
        categories: { hate: true },
        category_scores: { hate: 0.99 },
      });

      prisma.post.update.mockResolvedValue({
        profileId: 'non-existent-profile',
      });
      (resolveSystemModeratorActor as any).mockResolvedValue({
        userId: 'admin-1',
        profileId: 'admin-prof-1',
      });
      prisma.profile.findUnique.mockResolvedValue(null);

      await processor.process(job);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('catches and rethrows Error instance during moderation', async () => {
      const job = {
        name: 'moderate-content',
        data: {
          targetId: 'p-err',
          targetType: 'POST',
          text: 'err',
          mediaUrls: ['http://img.jpg'],
        },
      } as Job;

      aiService.generateEmbedding.mockRejectedValue(
        new Error('Fatal AI failure'),
      );

      await expect(processor.process(job)).rejects.toThrow('Fatal AI failure');
    });

    it('catches and rethrows non-Error instance during moderation', async () => {
      const job = {
        name: 'moderate-content',
        data: {
          targetId: 'p-err-2',
          targetType: 'POST',
          text: 'err',
          mediaUrls: ['http://img.jpg'],
        },
      } as Job;

      aiService.generateEmbedding.mockRejectedValue('String AI error');

      await expect(processor.process(job)).rejects.toBe('String AI error');
    });
  });
});
