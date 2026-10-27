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
    };
    conversation: { delete: ReturnType<typeof vi.fn> };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };
  let mockLeaveGroup: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      participant: { findFirst: vi.fn(), update: vi.fn() },
      conversation: { delete: vi.fn() },
    };
    mockEventEmitter = { emit: vi.fn() };
    mockLeaveGroup = { execute: vi.fn().mockResolvedValue({ success: true }) };
    useCase = new DeleteConversationUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
      mockLeaveGroup as never,
    );
  });

  it('throws Forbidden if caller is not a participant in the conversation', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    await expect(useCase.execute('prof-1', 'conv-1')).rejects.toThrow(
      AppException,
    );
  });

  it.each([
    ['an admin', true],
    ['a member', false],
  ])(
    'in a group, %s leaves it: the others keep the group and every message',
    async (_who, isAdmin) => {
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'part-1',
        isAdmin,
        conversation: { isGroup: true, participants: [] },
      });

      await expect(useCase.execute('prof-1', 'conv-group')).resolves.toEqual({
        success: true,
      });

      expect(mockLeaveGroup.execute).toHaveBeenCalledWith(
        'prof-1',
        'conv-group',
        undefined,
      );
      expect(mockPrisma.conversation.delete).not.toHaveBeenCalled();
    },
  );

  it('in a group, passes on the member an admin names to be admin after them', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      isAdmin: true,
      conversation: { isGroup: true, participants: [] },
    });

    await useCase.execute('prof-1', 'conv-group', 'prof-2');

    expect(mockLeaveGroup.execute).toHaveBeenCalledWith(
      'prof-1',
      'conv-group',
      'prof-2',
    );
  });

  it("in a 1:1 chat, removes it from the caller's inbox only, and never deletes the conversation", async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      conversation: { isGroup: false, participants: [] },
    });

    const result = await useCase.execute('prof-1', 'conv-direct');

    expect(result).toEqual({ success: true });
    expect(mockPrisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'part-1' },
      data: { deletedAt: expect.any(Date), clearedAt: expect.any(Date) },
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.deleted',
      {
        participants: [{ profileId: 'prof-1' }],
        payload: { conversationId: 'conv-direct' },
      },
    );
    expect(mockPrisma.conversation.delete).not.toHaveBeenCalled();
    expect(mockLeaveGroup.execute).not.toHaveBeenCalled();
  });
});
