import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { DeleteConversationUseCase } from './delete-conversation.use-case.js';

describe('DeleteConversationUseCase', () => {
  let useCase: DeleteConversationUseCase;
  let mockPrisma: {
    participant: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    conversation: {
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      participant: {
        findFirst: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      conversation: {
        delete: vi.fn(),
      },
    };
    mockEventEmitter = { emit: vi.fn() };
    useCase = new DeleteConversationUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('throws Forbidden if caller is not a participant in the conversation', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    await expect(useCase.execute('prof-1', 'conv-1')).rejects.toThrow(
      AppException,
    );
  });

  describe('Group conversation deletion', () => {
    it('throws Forbidden if participant is not an admin', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'part-1',
        isAdmin: false,
        conversation: { isGroup: true, participants: [] },
      });

      await expect(useCase.execute('prof-1', 'conv-group')).rejects.toThrow(
        AppException,
      );
    });

    it('deletes conversation and emits event when admin requests deletion', async () => {
      const participants = [{ profileId: 'prof-1' }, { profileId: 'prof-2' }];
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'part-1',
        isAdmin: true,
        conversation: { isGroup: true, participants },
      });
      mockPrisma.conversation.delete.mockResolvedValue({ id: 'conv-group' });

      const result = await useCase.execute('prof-1', 'conv-group');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({
        where: { id: 'conv-group' },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'chat.conversation.deleted',
        {
          participants,
          payload: { conversationId: 'conv-group' },
        },
      );
    });
  });

  describe('Direct conversation deletion', () => {
    it('soft deletes participant record for direct conversation when other participant is still active', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'part-1',
        isAdmin: false,
        conversation: {
          isGroup: false,
          participants: [{ profileId: 'prof-1' }, { profileId: 'prof-2' }],
        },
      });
      mockPrisma.participant.update.mockResolvedValue({ id: 'part-1' });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'part-2' }]); // Other participant active

      const result = await useCase.execute('prof-1', 'conv-direct');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.participant.update).toHaveBeenCalledWith({
        where: { id: 'part-1' },
        data: {
          deletedAt: expect.any(Date),
          clearedAt: expect.any(Date),
        },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'chat.conversation.deleted',
        {
          participants: [{ profileId: 'prof-1' }],
          payload: { conversationId: 'conv-direct' },
        },
      );
      expect(mockPrisma.conversation.delete).not.toHaveBeenCalled();
    });

    it('hard deletes direct conversation when both participants have deleted it', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'part-1',
        isAdmin: false,
        conversation: {
          isGroup: false,
          participants: [{ profileId: 'prof-1' }],
        },
      });
      mockPrisma.participant.update.mockResolvedValue({ id: 'part-1' });
      mockPrisma.participant.findMany.mockResolvedValue([]); // No remaining active participants

      const result = await useCase.execute('prof-1', 'conv-direct');

      expect(result).toEqual({ success: true });
      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({
        where: { id: 'conv-direct' },
      });
    });
  });
});
