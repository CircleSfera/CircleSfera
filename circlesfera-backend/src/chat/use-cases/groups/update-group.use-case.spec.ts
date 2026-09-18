import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { UpdateGroupUseCase } from './update-group.use-case.js';

describe('UpdateGroupUseCase', () => {
  let useCase: UpdateGroupUseCase;
  let mockPrisma: {
    participant: { findFirst: ReturnType<typeof vi.fn> };
    conversation: { update: ReturnType<typeof vi.fn> };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      participant: { findFirst: vi.fn() },
      conversation: { update: vi.fn() },
    };
    mockEventEmitter = { emit: vi.fn() };
    useCase = new UpdateGroupUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('throws Forbidden if participant is not admin or does not exist', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    await expect(
      useCase.execute('prof-1', 'conv-1', 'New Name'),
    ).rejects.toThrow(AppException);

    mockPrisma.participant.findFirst.mockResolvedValue({ isAdmin: false });

    await expect(
      useCase.execute('prof-1', 'conv-1', 'New Name'),
    ).rejects.toThrow(AppException);
  });

  it('updates group name and avatar, emits event, and returns updated conversation', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ isAdmin: true });
    const participants = [{ profileId: 'prof-1' }, { profileId: 'prof-2' }];
    const updated = {
      id: 'conv-1',
      name: 'Updated Name',
      avatarUrl: 'https://cdn/avatar.png',
      participants,
    };
    mockPrisma.conversation.update.mockResolvedValue(updated);

    const result = await useCase.execute(
      'prof-1',
      'conv-1',
      'Updated Name',
      'https://cdn/avatar.png',
    );

    expect(result).toBe(updated);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: {
        name: 'Updated Name',
        avatarUrl: 'https://cdn/avatar.png',
      },
      include: expect.any(Object),
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.updated',
      {
        participants,
        payload: updated,
      },
    );
  });

  it('handles updating with only name or only avatarUrl and fallback participants array', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ isAdmin: true });
    mockPrisma.conversation.update.mockResolvedValue({
      id: 'conv-1',
      participants: null,
    });

    await useCase.execute('prof-1', 'conv-1', 'Just Name');

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { name: 'Just Name' },
      include: expect.any(Object),
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.updated',
      {
        participants: [],
        payload: { id: 'conv-1', participants: null },
      },
    );

    await useCase.execute(
      'prof-1',
      'conv-1',
      undefined,
      'https://cdn/only-avatar.jpg',
    );

    expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { avatarUrl: 'https://cdn/only-avatar.jpg' },
      include: expect.any(Object),
    });
  });
});
