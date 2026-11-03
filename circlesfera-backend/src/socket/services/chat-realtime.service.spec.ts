import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddReactionUseCase } from '../../chat/use-cases/messages/add-reaction.use-case.js';
import {
  AUTHOR_ID,
  BUYER_ID,
  expectClosed,
  expectWhole,
  inlinePaidMedia,
  paidPost,
  realPaywall,
  STRANGER_ID,
} from '../../common/testing/paid-posts.js';
import { PostPaywallService } from '../../posts/services/post-paywall.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ChatRealtimeService } from './chat-realtime.service.js';

describe('ChatRealtimeService', () => {
  let service: ChatRealtimeService;
  let prisma: {
    participant: { findMany: ReturnType<typeof vi.fn> };
    conversation: { findUnique: ReturnType<typeof vi.fn> };
    block: { findMany: ReturnType<typeof vi.fn> };
  };
  let addReactionUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      participant: { findMany: vi.fn().mockResolvedValue([]) },
      conversation: { findUnique: vi.fn() },
      block: { findMany: vi.fn().mockResolvedValue([]) },
    };
    addReactionUseCase = { execute: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatRealtimeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AddReactionUseCase, useValue: addReactionUseCase },
        { provide: PostPaywallService, useValue: realPaywall() },
      ],
    }).compile();

    service = module.get<ChatRealtimeService>(ChatRealtimeService);
  });

  it('reads the blocks among the members of a conversation', async () => {
    prisma.block.findMany.mockResolvedValue([
      { blockerId: 'a', blockedId: 'b' },
    ]);

    const pairs = await service.blocksAmong(['a', 'b']);

    expect([...(pairs.get('b') ?? [])]).toEqual(['a']);
  });

  describe('a paid post a message shares', () => {
    const seenBy = (member: string) =>
      service.sharedPostAsSeenBy(paidPost([inlinePaidMedia()]), member);

    it('is closed to a member who has not unlocked it', async () => {
      expectClosed(await seenBy(STRANGER_ID));
    });

    it('is whole for its author and for a member who unlocked it', async () => {
      expectWhole(await seenBy(AUTHOR_ID));
      expectWhole(await seenBy(BUYER_ID));
    });
  });

  describe('membersOf', () => {
    it('answers only the Profiles with a row they have not removed', async () => {
      prisma.participant.findMany.mockResolvedValue([{ profileId: 'p-1' }]);

      const members = await service.membersOf('conv-1', ['p-1', 'p-2', 'p-1']);

      expect([...members]).toEqual(['p-1']);
      expect(prisma.participant.findMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          profileId: { in: ['p-1', 'p-2'] },
          deletedAt: null,
        },
        select: { profileId: true },
      });
    });
  });

  it('rejects a reaction from a Profile that is not in the conversation now', async () => {
    prisma.participant.findMany.mockResolvedValue([]);

    const result = await service.addReaction(
      'msg-1',
      'conv-1',
      'profile-1',
      '❤️',
    );

    expect(result.success).toBe(false);
    expect(addReactionUseCase.execute).not.toHaveBeenCalled();
  });

  it('records a reaction from a member and answers who to tell', async () => {
    prisma.participant.findMany.mockResolvedValue([{ profileId: 'profile-1' }]);
    addReactionUseCase.execute.mockResolvedValue({
      id: 'reaction-1',
      reaction: '🔥',
    });
    prisma.conversation.findUnique.mockResolvedValue({
      participants: [{ profileId: 'profile-1' }, { profileId: 'profile-2' }],
    });

    const result = await service.addReaction(
      'msg-1',
      'conv-1',
      'profile-1',
      '🔥',
    );

    expect(addReactionUseCase.execute).toHaveBeenCalledWith(
      'msg-1',
      'profile-1',
      '🔥',
    );
    expect(result).toEqual({
      success: true,
      reactionRecord: { id: 'reaction-1', reaction: '🔥' },
      participantProfileIds: ['profile-1', 'profile-2'],
    });
  });

  describe('for a member', () => {
    beforeEach(() => {
      prisma.participant.findMany.mockResolvedValue([
        { profileId: 'profile-1' },
      ]);
    });

    it('handles null conversation when querying participants', async () => {
      addReactionUseCase.execute.mockResolvedValue({
        id: 'reaction-1',
        reaction: '👍',
      });
      prisma.conversation.findUnique.mockResolvedValue(null);

      const result = await service.addReaction(
        'msg-1',
        'conv-1',
        'profile-1',
        '👍',
      );

      expect(result.success).toBe(true);
      expect(result.participantProfileIds).toEqual([]);
    });

    it('handles error when addReactionUseCase throws an Error instance', async () => {
      addReactionUseCase.execute.mockRejectedValueOnce(
        new Error('Validation failed'),
      );

      const result = await service.addReaction(
        'msg-1',
        'conv-1',
        'profile-1',
        '👍',
      );

      expect(result.success).toBe(false);
    });

    it('handles error when addReactionUseCase throws a non-Error', async () => {
      addReactionUseCase.execute.mockRejectedValueOnce('raw string error');

      const result = await service.addReaction(
        'msg-1',
        'conv-1',
        'profile-1',
        '👍',
      );

      expect(result.success).toBe(false);
    });
  });
});
