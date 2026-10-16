import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InteractiveService } from './interactive.service.js';

describe('InteractiveService', () => {
  let service: InteractiveService;

  const mockPrismaService = {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    block: { findFirst: vi.fn().mockResolvedValue(null) },
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
      findMany: vi.fn(),
    },
    post: {
      findUnique: vi.fn(),
    },
    story: {
      findUnique: vi.fn(),
    },
    storySticker: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    storyStickerResponse: {
      upsert: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
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
      // The poll of a story is one of its stickers.
      mockPrismaService.storySticker.findFirst.mockResolvedValueOnce({
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
      mockPrismaService.storySticker.create.mockResolvedValueOnce({
        id: 'new-story-poll',
        createdAt: new Date(),
      });

      const res = await service.createPoll('p-1', {
        question: 'Story Q?',
        options: ['Yes', 'No'],
        storyId: 'story-1',
      } as any);
      expect(res).toMatchObject({
        id: 'new-story-poll',
        question: 'Story Q?',
        options: ['Yes', 'No'],
        storyId: 'story-1',
      });
      expect(mockPrismaService.storySticker.create).toHaveBeenLastCalledWith({
        data: {
          storyId: 'story-1',
          kind: 'POLL',
          settings: { question: 'Story Q?', options: ['Yes', 'No'] },
        },
      });
      expect(mockPrismaService.poll.create).not.toHaveBeenCalled();
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
      mockPrismaService.storySticker.findFirst.mockResolvedValueOnce({
        id: 'existing',
      });
      await expect(
        service.createQnaBox('p-1', { prompt: 'Ask', storyId: 's-1' } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 's-1',
        profileId: 'p-1',
      });
      mockPrismaService.storySticker.create.mockResolvedValueOnce({
        id: 'qna-story',
        createdAt: new Date(),
      });

      const res = await service.createQnaBox('p-1', {
        prompt: 'Ask story',
        storyId: 's-1',
      } as any);
      expect(res).toMatchObject({ id: 'qna-story', prompt: 'Ask story' });
      expect(mockPrismaService.storySticker.create).toHaveBeenLastCalledWith({
        data: {
          storyId: 's-1',
          kind: 'QUESTION',
          settings: { prompt: 'Ask story' },
        },
      });
    });
  });

  describe('where a sticker sits on a story', () => {
    const placement = { x: 0.1, y: -0.25, scale: 1.2, rotation: -8 };

    it('keeps the place of a poll on a story', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 'story-1',
        profileId: 'p-1',
      });
      mockPrismaService.storySticker.create.mockResolvedValueOnce({
        id: 'poll-1',
        createdAt: new Date(),
      });

      await service.createPoll('p-1', {
        question: 'Q?',
        options: ['A', 'B'],
        storyId: 'story-1',
        placement,
      });

      expect(mockPrismaService.storySticker.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          storyId: 'story-1',
          kind: 'POLL',
          x: 0.1,
          y: -0.25,
          scale: 1.2,
          rotation: -8,
        }),
      });
    });

    it('keeps the place of a question on a story', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 's-1',
        profileId: 'p-1',
      });
      mockPrismaService.storySticker.create.mockResolvedValueOnce({
        id: 'qna-1',
        createdAt: new Date(),
      });

      await service.createQnaBox('p-1', {
        prompt: 'Ask',
        storyId: 's-1',
        placement,
      });

      expect(mockPrismaService.storySticker.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          kind: 'QUESTION',
          x: 0.1,
          y: -0.25,
          scale: 1.2,
          rotation: -8,
        }),
      });
    });

    it('leaves the place empty when none is given, as older apps send it', async () => {
      mockPrismaService.story.findUnique.mockResolvedValueOnce({
        id: 'story-1',
        profileId: 'p-1',
      });
      mockPrismaService.storySticker.create.mockResolvedValueOnce({
        id: 'poll-2',
        createdAt: new Date(),
      });

      await service.createPoll('p-1', {
        question: 'Q?',
        options: ['A', 'B'],
        storyId: 'story-1',
      });

      const { data } =
        mockPrismaService.storySticker.create.mock.calls.at(-1)![0];
      expect(data).not.toHaveProperty('x');
    });

    it('refuses a place on a post, which has none', async () => {
      await expect(
        service.createPoll('p-1', {
          question: 'Q?',
          options: ['A', 'B'],
          postId: 'post-1',
          placement,
        }),
      ).rejects.toThrow('A placement is only for a story');
      await expect(
        service.createQnaBox('p-1', {
          prompt: 'Ask',
          postId: 'post-1',
          placement,
        }),
      ).rejects.toThrow('A placement is only for a story');
      expect(mockPrismaService.post.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('the poll and question of a story, through the routes apps already installed use', () => {
    const storyPoll = {
      id: 'st-poll',
      storyId: 'story-1',
      settings: { question: '¿Playa?', options: ['Sí', 'No'] },
      story: { profileId: 'author' },
    };

    it('records a vote on the sticker and answers in the poll shape', async () => {
      mockPrismaService.storySticker.findFirst.mockResolvedValue(storyPoll);
      mockPrismaService.storyStickerResponse.findMany.mockResolvedValueOnce([
        { profileId: 'viewer', optionIndex: 1 },
        { profileId: 'x', optionIndex: 0 },
      ]);

      const res = await service.votePoll('viewer', 'st-poll', 1);

      expect(
        mockPrismaService.storyStickerResponse.upsert,
      ).toHaveBeenCalledWith({
        where: {
          voteKey_profileId: { voteKey: 'st-poll', profileId: 'viewer' },
        },
        create: {
          stickerId: 'st-poll',
          voteKey: 'st-poll',
          profileId: 'viewer',
          optionIndex: 1,
        },
        update: { optionIndex: 1 },
      });
      expect(mockPrismaService.pollVote.upsert).not.toHaveBeenCalled();
      expect(res).toEqual({
        id: 'st-poll',
        question: '¿Playa?',
        totalVotes: 2,
        userVoteIndex: 1,
        options: [
          { index: 0, text: 'Sí', votes: 1, percentage: 50 },
          { index: 1, text: 'No', votes: 1, percentage: 50 },
        ],
        postId: null,
        storyId: 'story-1',
      });
      mockPrismaService.storySticker.findFirst.mockResolvedValue(null);
    });

    it('hides the poll of a story from a viewer blocked either way', async () => {
      mockPrismaService.storySticker.findFirst.mockResolvedValueOnce(storyPoll);
      mockPrismaService.block.findFirst.mockResolvedValueOnce({ id: 'b' });
      await expect(service.getPoll('st-poll', 'viewer')).rejects.toThrow(
        AppException,
      );
    });

    it('refuses an option the sticker does not have', async () => {
      mockPrismaService.storySticker.findFirst.mockResolvedValueOnce(storyPoll);
      await expect(service.votePoll('viewer', 'st-poll', 5)).rejects.toThrow(
        AppException,
      );
    });

    it('keeps an answer to the question of a story on its sticker', async () => {
      mockPrismaService.storySticker.findFirst.mockResolvedValueOnce({
        ...storyPoll,
        id: 'st-q',
        settings: { prompt: 'Pregunta' },
      });
      mockPrismaService.storyStickerResponse.create.mockResolvedValueOnce({
        id: 'r1',
        text: 'Hola',
        createdAt: new Date('2026-01-01'),
      });

      const res = await service.answerQna('viewer', 'st-q', ' Hola ');

      expect(
        mockPrismaService.storyStickerResponse.create,
      ).toHaveBeenCalledWith({
        data: { stickerId: 'st-q', profileId: 'viewer', text: 'Hola' },
      });
      expect(mockPrismaService.qnaAnswer.create).not.toHaveBeenCalled();
      expect(res).toMatchObject({
        id: 'r1',
        qnaBoxId: 'st-q',
        answerText: 'Hola',
      });
    });

    it('gives the answers of a story question to its author only', async () => {
      const question = {
        ...storyPoll,
        id: 'st-q',
        settings: { prompt: 'Pregunta' },
      };
      mockPrismaService.storySticker.findFirst.mockResolvedValueOnce(question);
      expect(await service.getQnaBox('st-q', 'viewer')).toEqual({
        id: 'st-q',
        prompt: 'Pregunta',
        totalAnswers: 0,
        answers: [],
      });

      mockPrismaService.storySticker.findFirst.mockResolvedValueOnce(question);
      mockPrismaService.storyStickerResponse.findMany.mockResolvedValueOnce([
        {
          id: 'r1',
          text: 'Hola',
          createdAt: new Date('2026-01-01'),
          profile: {
            id: 'viewer',
            username: 'bea',
            fullName: 'Bea',
            avatar: null,
            user: { id: 'u-bea' },
          },
        },
      ]);
      const forAuthor = await service.getQnaBox('st-q', 'author');
      expect(forAuthor.totalAnswers).toBe(1);
      expect(forAuthor.answers[0]).toMatchObject({
        answerText: 'Hola',
        user: { id: 'u-bea', username: 'bea' },
      });
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

      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        profileId: 'user-1',
        visibility: 'PUBLIC',
        moderationStatus: 'VISIBLE',
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
        postId: 'post-1',
        votes: [],
      });
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        profileId: 'user-1',
        visibility: 'PUBLIC',
        moderationStatus: 'VISIBLE',
      });

      const res = await service.getPoll('poll-empty');
      expect(res.totalVotes).toBe(0);
      expect(res.options[0].percentage).toBe(0);
      expect(res.userVoteIndex).toBeNull();
    });

    it('finds no poll that belongs to no post: a story poll is a sticker', async () => {
      mockPrismaService.poll.findUnique.mockResolvedValueOnce({
        id: 'poll-orphan',
        question: 'Q?',
        options: ['Yes'],
        postId: null,
        votes: [],
      });

      await expect(service.getPoll('poll-orphan', 'viewer')).rejects.toThrow(
        'Poll not found',
      );
      expect(mockPrismaService.post.findUnique).not.toHaveBeenCalled();
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
    const answers = [
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
    ];
    const boxOnPost = {
      id: 'qna-1',
      prompt: 'Ask me anything',
      post: { profileId: 'owner-profile' },
    };

    beforeEach(() => {
      mockPrismaService.qnaAnswer.findMany.mockReset();
      mockPrismaService.qnaAnswer.findMany.mockResolvedValue(answers);
    });

    it('throws NotFound if Q&A box does not exist', async () => {
      mockPrismaService.qnaBox.findUnique.mockResolvedValueOnce(null);
      await expect(service.getQnaBox('qna-none')).rejects.toThrow(AppException);
    });

    it.each([
      ['someone not signed in', undefined],
      ['another profile', 'viewer-profile'],
    ])(
      'gives %s the question and no answer, without reading the answers',
      async (_who, viewer) => {
        mockPrismaService.qnaBox.findUnique.mockResolvedValue(boxOnPost);

        const res = await service.getQnaBox('qna-1', viewer);

        expect(res).toEqual({
          id: 'qna-1',
          prompt: 'Ask me anything',
          totalAnswers: 0,
          answers: [],
        });
        expect(mockPrismaService.qnaAnswer.findMany).not.toHaveBeenCalled();
      },
    );

    it('gives no answer when the box has no owner to compare with', async () => {
      mockPrismaService.qnaBox.findUnique.mockResolvedValue({
        ...boxOnPost,
        post: null,
      });

      const res = await service.getQnaBox('qna-1', 'owner-profile');

      expect(res.answers).toEqual([]);
      expect(mockPrismaService.qnaAnswer.findMany).not.toHaveBeenCalled();
    });

    it('gives the owner of the post every answer, newest first, with who gave it', async () => {
      mockPrismaService.qnaBox.findUnique.mockResolvedValue(boxOnPost);

      const res = await service.getQnaBox('qna-1', 'owner-profile');

      expect(mockPrismaService.qnaAnswer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { qnaBoxId: 'qna-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(res.totalAnswers).toBe(2);
      expect(res.answers[0]).toMatchObject({
        id: 'ans-1',
        answerText: 'Hello',
        user: {
          id: 'user-1',
          username: 'alice',
          fullName: 'Alice',
          avatar: 'https://cdn/a.png',
        },
      });
      // An answer whose profile is gone keeps a neutral name.
      expect(res.answers[1].user).toEqual({
        id: '',
        username: 'usuario',
        fullName: 'usuario',
        avatar: null,
      });
    });
  });
});
