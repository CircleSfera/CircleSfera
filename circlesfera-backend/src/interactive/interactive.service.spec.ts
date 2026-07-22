import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { InteractiveService } from './interactive.service.js';

describe('InteractiveService', () => {
  let service: InteractiveService;

  const mockPrismaService = {
    poll: {
      findUnique: vi.fn(),
    },
    pollVote: {
      upsert: vi.fn(),
    },
    qnaBox: {
      findUnique: vi.fn(),
    },
    qnaAnswer: {
      create: vi.fn(),
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

  describe('votePoll', () => {
    it('should register a poll vote and return percentages', async () => {
      mockPrismaService.poll.findUnique.mockResolvedValue({
        id: 'poll-1',
        question: 'Best framework?',
        options: ['React', 'Vue'],
        postId: 'post-1',
        votes: [
          { optionIndex: 0, userId: 'user-1' },
          { optionIndex: 1, userId: 'user-2' },
        ],
      });

      const res = await service.votePoll('user-1', 'poll-1', 0);
      expect(res.totalVotes).toBe(2);
      expect(res.options[0].percentage).toBe(50);
      expect(mockPrismaService.pollVote.upsert).toHaveBeenCalled();
    });
  });

  describe('answerQna', () => {
    it('should submit an answer to a Q&A box', async () => {
      mockPrismaService.qnaBox.findUnique.mockResolvedValue({ id: 'qna-1' });
      mockPrismaService.qnaAnswer.create.mockResolvedValue({
        id: 'ans-1',
        qnaBoxId: 'qna-1',
        answerText: 'My favorite tool is CircleSfera',
        createdAt: new Date(),
      });

      const res = await service.answerQna('user-1', 'qna-1', 'My favorite tool is CircleSfera');
      expect(res.answerText).toContain('CircleSfera');
    });
  });
});
