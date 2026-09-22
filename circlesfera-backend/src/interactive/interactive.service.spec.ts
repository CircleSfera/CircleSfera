import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InteractiveService } from './interactive.service.js';

describe('InteractiveService', () => {
  let service: InteractiveService;

  const mockPrismaService = {
    poll: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    pollVote: {
      upsert: vi.fn(),
    },
    qnaBox: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    qnaAnswer: {
      create: vi.fn(),
    },
    post: {
      findUnique: vi.fn(),
    },
    story: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractiveService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<InteractiveService>(InteractiveService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createPoll', () => {
    it('validates postId and storyId mutual exclusivity and presence', async () => {
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
        } as any),
      ).rejects.toThrow(AppException);

      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
          postId: 'post-1',
          storyId: 'story-1',
        } as any),
      ).rejects.toThrow(AppException);
    });

    it('requires at least 2 non-empty options', async () => {
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', ' '],
          postId: 'post-1',
        } as any),
      ).rejects.toThrow(AppException);
    });

    it('handles post-attached poll validation and creation', async () => {
      // Post not found
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
          postId: 'post-missing',
        } as any),
      ).rejects.toThrow(AppException);

      // Not your post
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        profileId: 'other-profile',
      });
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
          postId: 'post-1',
        } as any),
      ).rejects.toThrow(AppException);

      // Existing poll
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        profileId: 'p-1',
      });
      mockPrismaService.poll.findUnique.mockResolvedValueOnce({
        id: 'existing-poll',
      });
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
          postId: 'post-1',
        } as any),
      ).rejects.toThrow(AppException);

      // Success
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        profileId: 'p-1',
      });
      mockPrismaService.poll.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.poll.create.mockResolvedValueOnce({ id: 'new-poll' });

      const res = await service.createPoll('p-1', {
        question: ' Q? ',
        options: ['A', 'B'],
        postId: 'post-1',
      } as any);
      expect(res.id).toBe('new-poll');
    });

    it('handles story-attached poll validation and creation', async () => {
      // Story not found
      mockPrismaService.story.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
          storyId: 'story-missing',
        } as any),
      ).rejects.toThrow(AppException);

      // Not your story
      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 'story-1',
        profileId: 'other-profile',
      });
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
          storyId: 'story-1',
        } as any),
      ).rejects.toThrow(AppException);

      // Story already has poll
      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 'story-1',
        profileId: 'p-1',
      });
      mockPrismaService.poll.findUnique.mockResolvedValueOnce({
        id: 'existing',
      });
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
          storyId: 'story-1',
        } as any),
      ).rejects.toThrow(AppException);

      // Success
      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 'story-1',
        profileId: 'p-1',
      });
      mockPrismaService.poll.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.poll.create.mockResolvedValueOnce({
        id: 'new-story-poll',
      });

      const res = await service.createPoll('p-1', {
        question: 'Story Q?',
        options: ['Yes', 'No'],
        storyId: 'story-1',
      } as any);
      expect(res.id).toBe('new-story-poll');
    });
  });

  describe('createQnaBox', () => {
    it('validates postId and storyId exclusivity and presence', async () => {
      await expect(
        service.createQnaBox('p-1', { prompt: 'Ask' } as any),
      ).rejects.toThrow(AppException);

      await expect(
        service.createQnaBox('p-1', {
          prompt: 'Ask',
          postId: 'post-1',
          storyId: 'story-1',
        } as any),
      ).rejects.toThrow(AppException);
    });

    it('handles post-attached Q&A box validation and creation', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createQnaBox('p-1', {
          prompt: 'Ask',
          postId: 'post-none',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        profileId: 'other',
      });
      await expect(
        service.createQnaBox('p-1', { prompt: 'Ask', postId: 'post-1' } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        profileId: 'p-1',
      });
      mockPrismaService.qnaBox.findUnique.mockResolvedValueOnce({
        id: 'existing',
      });
      await expect(
        service.createQnaBox('p-1', { prompt: 'Ask', postId: 'post-1' } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        profileId: 'p-1',
      });
      mockPrismaService.qnaBox.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.qnaBox.create.mockResolvedValueOnce({ id: 'qna-post' });

      const res = await service.createQnaBox('p-1', {
        prompt: ' Ask me ',
        postId: 'post-1',
      } as any);
      expect(res.id).toBe('qna-post');
    });

    it('handles story-attached Q&A box validation and creation', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createQnaBox('p-1', {
          prompt: 'Ask',
          storyId: 'story-none',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 's-1',
        profileId: 'other',
      });
      await expect(
        service.createQnaBox('p-1', { prompt: 'Ask', storyId: 's-1' } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 's-1',
        profileId: 'p-1',
      });
      mockPrismaService.qnaBox.findUnique.mockResolvedValueOnce({
        id: 'existing',
      });
      await expect(
        service.createQnaBox('p-1', { prompt: 'Ask', storyId: 's-1' } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 's-1',
        profileId: 'p-1',
      });
      mockPrismaService.qnaBox.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.qnaBox.create.mockResolvedValueOnce({
        id: 'qna-story',
      });

      const res = await service.createQnaBox('p-1', {
        prompt: 'Ask story',
        storyId: 's-1',
      } as any);
      expect(res.id).toBe('qna-story');
    });
  });

  describe('votePoll', () => {
    it('throws NotFound if poll does not exist', async () => {
      mockPrismaService.poll.findUnique.mockResolvedValueOnce(null);
      await expect(service.votePoll('u1', 'poll-none', 0)).rejects.toThrow(
        AppException,
      );
    });

    it('throws BadRequest if option index is out of bounds', async () => {
      mockPrismaService.poll.findUnique.mockResolvedValue({
        id: 'poll-1',
        options: ['A', 'B'],
      });
      await expect(service.votePoll('u1', 'poll-1', 2)).rejects.toThrow(
        AppException,
      );
      await expect(service.votePoll('u1', 'poll-1', -1)).rejects.toThrow(
        AppException,
      );
    });

    it('should register a poll vote and return percentages', async () => {
      mockPrismaService.poll.findUnique.mockResolvedValue({
        id: 'poll-1',
        question: 'Best framework?',
        options: ['React', 'Vue'],
        postId: 'post-1',
        votes: [
          { optionIndex: 0, profileId: 'user-1' },
          { optionIndex: 1, profileId: 'user-2' },
        ],
      });

      const res = await service.votePoll('user-1', 'poll-1', 0);
      expect(res.totalVotes).toBe(2);
      expect(res.userVoteIndex).toBe(0);
      expect(res.options[0].percentage).toBe(50);
      expect(mockPrismaService.pollVote.upsert).toHaveBeenCalled();
    });
  });

  describe('getPoll', () => {
    it('returns empty percentages when no votes recorded', async () => {
      mockPrismaService.poll.findUnique.mockResolvedValueOnce({
        id: 'poll-empty',
        question: 'Empty?',
        options: ['Yes', 'No'],
        votes: [],
      });

      const res = await service.getPoll('poll-empty');
      expect(res.totalVotes).toBe(0);
      expect(res.options[0].percentage).toBe(0);
      expect(res.userVoteIndex).toBeNull();
    });

    it('throws NotFound when poll is missing', async () => {
      mockPrismaService.poll.findUnique.mockResolvedValueOnce(null);
      await expect(service.getPoll('poll-none')).rejects.toThrow(AppException);
    });
  });

  describe('answerQna', () => {
    it('throws BadRequest on empty answer text', async () => {
      await expect(service.answerQna('u-1', 'qna-1', '   ')).rejects.toThrow(
        AppException,
      );
    });

    it('throws NotFound if Q&A box does not exist', async () => {
      mockPrismaService.qnaBox.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.answerQna('u-1', 'qna-none', 'Hello'),
      ).rejects.toThrow(AppException);
    });

    it('should submit an answer to a Q&A box', async () => {
      mockPrismaService.qnaBox.findUnique.mockResolvedValue({ id: 'qna-1' });
      mockPrismaService.qnaAnswer.create.mockResolvedValue({
        id: 'ans-1',
        qnaBoxId: 'qna-1',
        answerText: 'My favorite tool is CircleSfera',
        createdAt: new Date(),
      });

      const res = await service.answerQna(
        'user-1',
        'qna-1',
        'My favorite tool is CircleSfera',
      );
      expect(res.answerText).toContain('CircleSfera');
    });
  });

  describe('getQnaBox', () => {
    it('throws NotFound if Q&A box does not exist', async () => {
      mockPrismaService.qnaBox.findUnique.mockResolvedValueOnce(null);
      await expect(service.getQnaBox('qna-none')).rejects.toThrow(AppException);
    });

    it('maps answer profile onto user shape for clients with fallback', async () => {
      mockPrismaService.qnaBox.findUnique.mockResolvedValue({
        id: 'qna-1',
        prompt: 'Ask me anything',
        answers: [
          {
            id: 'ans-1',
            answerText: 'Hello',
            createdAt: new Date('2026-01-01'),
            profile: {
              id: 'profile-1',
              username: 'alice',
              avatar: 'https://cdn/a.png',
              fullName: 'Alice',
              user: { id: 'user-1' },
            },
          },
          {
            id: 'ans-2',
            answerText: 'Anonymous answer',
            createdAt: new Date('2026-01-02'),
            profile: null,
          },
        ],
      });

      const res = await service.getQnaBox('qna-1');
      expect(res.answers[0].user).toEqual({
        id: 'user-1',
        username: 'alice',
        fullName: 'Alice',
        avatar: 'https://cdn/a.png',
      });
      expect(res.answers[1].user.username).toBe('usuario');
    });
  });
});
