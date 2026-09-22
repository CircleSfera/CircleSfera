import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddReactionUseCase } from '../../chat/use-cases/messages/add-reaction.use-case.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ChatRealtimeService } from './chat-realtime.service.js';

describe('ChatRealtimeService', () => {
  let service: ChatRealtimeService;
  let prisma: {
    participant: { findUnique: ReturnType<typeof vi.fn> };
    conversation: { findUnique: ReturnType<typeof vi.fn> };
  };
  let addReactionUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      participant: { findUnique: vi.fn() },
      conversation: { findUnique: vi.fn() },
    };
    addReactionUseCase = { execute: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatRealtimeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AddReactionUseCase, useValue: addReactionUseCase },
      ],
    }).compile();

    service = module.get<ChatRealtimeService>(ChatRealtimeService);
  });

  it('rejects reaction if caller is not a participant in the conversation and not cached', async () => {
    prisma.participant.findUnique.mockResolvedValue(null);

    const result = await service.addReaction(
      'msg-1',
      'conv-1',
      'profile-1',
      '❤️',
      false,
    );

    expect(result.success).toBe(false);
    expect(addReactionUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects reaction if caller participant record is soft-deleted', async () => {
    prisma.participant.findUnique.mockResolvedValue({
      deletedAt: new Date(),
    });

    const result = await service.addReaction(
      'msg-1',
      'conv-1',
      'profile-1',
      '❤️',
      false,
    );

    expect(result.success).toBe(false);
    expect(addReactionUseCase.execute).not.toHaveBeenCalled();
  });

  it('executes reaction directly when conversation access is cached', async () => {
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
      true,
    );

    expect(prisma.participant.findUnique).not.toHaveBeenCalled();
    expect(addReactionUseCase.execute).toHaveBeenCalledWith(
      'msg-1',
      'profile-1',
      '🔥',
    );
    expect(result).toEqual({
      success: true,
      grantConversationAccess: false,
      reactionRecord: { id: 'reaction-1', reaction: '🔥' },
      participantProfileIds: ['profile-1', 'profile-2'],
    });
  });

  it('grants conversation access when verified through database fallback', async () => {
    prisma.participant.findUnique.mockResolvedValue({
      profileId: 'profile-1',
      deletedAt: null,
    });
    addReactionUseCase.execute.mockResolvedValue({
      id: 'reaction-1',
      reaction: '👍',
    });
    prisma.conversation.findUnique.mockResolvedValue({
      participants: [{ profileId: 'profile-1' }],
    });

    const result = await service.addReaction(
      'msg-1',
      'conv-1',
      'profile-1',
      '👍',
      false,
    );

    expect(result.success).toBe(true);
    expect(result.grantConversationAccess).toBe(true);
    expect(result.participantProfileIds).toEqual(['profile-1']);
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
      true,
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
      true,
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
      true,
    );

    expect(result.success).toBe(false);
  });
});
