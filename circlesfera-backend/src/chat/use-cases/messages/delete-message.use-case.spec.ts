import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { DeleteMessageUseCase } from './delete-message.use-case.js';

describe('DeleteMessageUseCase', () => {
  let useCase: DeleteMessageUseCase;
  let mockPrisma: {
    message: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      message: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    mockEventEmitter = {
      emit: vi.fn(),
    };
    useCase = new DeleteMessageUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('throws NotFound if message does not exist', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('profile-1', 'msg-1')).rejects.toThrow(
      AppException,
    );
  });

  it('throws Forbidden if caller is not the sender', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: 'other-profile',
      conversation: { participants: [{ profileId: 'other-profile' }] },
    });

    await expect(useCase.execute('profile-1', 'msg-1')).rejects.toThrow(
      AppException,
    );
  });

  it('soft deletes message, clears media, emits event, and returns result', async () => {
    const participants = [
      { profileId: 'profile-1' },
      { profileId: 'profile-2' },
    ];
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: 'profile-1',
      conversation: { participants },
    });

    const updatedMessage = {
      id: 'msg-1',
      content: '',
      isDeleted: true,
      url: null,
      mediaType: null,
      sender: { id: 'profile-1', username: 'user1' },
    };
    mockPrisma.message.update.mockResolvedValue(updatedMessage);

    const result = await useCase.execute('profile-1', 'msg-1');

    expect(result).toEqual({ success: true, message: updatedMessage });
    expect(mockPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: {
        content: '',
        isDeleted: true,
        url: null,
        mediaType: null,
      },
      include: expect.any(Object),
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('chat.message.deleted', {
      participants,
      payload: { messageId: 'msg-1' },
    });
  });
});
