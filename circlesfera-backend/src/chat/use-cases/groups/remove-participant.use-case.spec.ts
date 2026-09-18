import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { RemoveParticipantUseCase } from './remove-participant.use-case.js';

describe('RemoveParticipantUseCase', () => {
  let useCase: RemoveParticipantUseCase;
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
    useCase = new RemoveParticipantUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('throws Forbidden if caller is not an admin in conversation', async () => {
    mockPrisma.participant.findFirst.mockResolvedValueOnce(null);

    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-target'),
    ).rejects.toThrow(AppException);

    mockPrisma.participant.findFirst.mockResolvedValueOnce({ isAdmin: false });

    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-target'),
    ).rejects.toThrow(AppException);
  });

  it('throws NotFound if target participant is not in conversation', async () => {
    mockPrisma.participant.findFirst
      .mockResolvedValueOnce({ isAdmin: true }) // caller
      .mockResolvedValueOnce(null); // target

    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-target'),
    ).rejects.toThrow(AppException);
  });

  it('removes target participant and emits conversation update event', async () => {
    mockPrisma.participant.findFirst
      .mockResolvedValueOnce({ id: 'part-admin', isAdmin: true })
      .mockResolvedValueOnce({ id: 'part-target', profileId: 'prof-target' });

    mockPrisma.participant.delete.mockResolvedValue({ id: 'part-target' });

    const remainingParticipants = [{ profileId: 'prof-admin' }];
    const updatedConv = {
      id: 'conv-1',
      participants: remainingParticipants,
    };
    mockPrisma.conversation.findUnique.mockResolvedValue(updatedConv);

    const result = await useCase.execute('prof-1', 'conv-1', 'prof-target');

    expect(result).toBe(updatedConv);
    expect(mockPrisma.participant.delete).toHaveBeenCalledWith({
      where: { id: 'part-target' },
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.updated',
      {
        participants: [
          ...remainingParticipants,
          { id: 'part-target', profileId: 'prof-target' },
        ],
        payload: updatedConv,
      },
    );
  });

  it('handles case where conversation is not found after removal', async () => {
    mockPrisma.participant.findFirst
      .mockResolvedValueOnce({ id: 'part-admin', isAdmin: true })
      .mockResolvedValueOnce({ id: 'part-target', profileId: 'prof-target' });
    mockPrisma.participant.delete.mockResolvedValue({ id: 'part-target' });
    mockPrisma.conversation.findUnique.mockResolvedValue(null);

    const result = await useCase.execute('prof-1', 'conv-1', 'prof-target');

    expect(result).toBeNull();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('handles case where conversation has no participants field', async () => {
    mockPrisma.participant.findFirst
      .mockResolvedValueOnce({ id: 'part-admin', isAdmin: true })
      .mockResolvedValueOnce({ id: 'part-target', profileId: 'prof-target' });
    mockPrisma.participant.delete.mockResolvedValue({ id: 'part-target' });
    const updatedConv = { id: 'conv-1', participants: null };
    mockPrisma.conversation.findUnique.mockResolvedValue(updatedConv);

    const result = await useCase.execute('prof-1', 'conv-1', 'prof-target');

    expect(result).toBe(updatedConv);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.updated',
      {
        participants: [{ id: 'part-target', profileId: 'prof-target' }],
        payload: updatedConv,
      },
    );
  });
});
