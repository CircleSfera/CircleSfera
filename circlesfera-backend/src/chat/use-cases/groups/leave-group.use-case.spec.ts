import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { LeaveGroupUseCase } from './leave-group.use-case.js';

describe('LeaveGroupUseCase', () => {
  let useCase: LeaveGroupUseCase;
  let mockPrisma: {
    participant: {
      findFirst: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    conversation: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      participant: {
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      conversation: {
        findUnique: vi.fn(),
      },
    };
    mockEventEmitter = { emit: vi.fn() };
    useCase = new LeaveGroupUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('throws Forbidden if caller is not a participant', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    await expect(useCase.execute('prof-1', 'conv-1')).rejects.toThrow(
      AppException,
    );
  });

  it('deletes participant, notifies remaining members and leaver, and returns success', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });
    mockPrisma.participant.delete.mockResolvedValue({ id: 'part-1' });

    const remainingParticipants = [{ profileId: 'prof-2' }];
    const updatedConv = {
      id: 'conv-1',
      participants: remainingParticipants,
    };
    mockPrisma.conversation.findUnique.mockResolvedValue(updatedConv);

    const result = await useCase.execute('prof-1', 'conv-1');

    expect(result).toEqual({ success: true });
    expect(mockPrisma.participant.delete).toHaveBeenCalledWith({
      where: { id: 'part-1' },
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.updated',
      {
        participants: remainingParticipants,
        payload: updatedConv,
      },
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.deleted',
      {
        participants: [{ profileId: 'prof-1' }],
        payload: { conversationId: 'conv-1' },
      },
    );
  });

  it('handles case where conversation is no longer found after leaving', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });
    mockPrisma.participant.delete.mockResolvedValue({ id: 'part-1' });
    mockPrisma.conversation.findUnique.mockResolvedValue(null);

    const result = await useCase.execute('prof-1', 'conv-1');

    expect(result).toEqual({ success: true });
    expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
      'chat.conversation.updated',
      expect.anything(),
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.deleted',
      expect.anything(),
    );
  });
});
