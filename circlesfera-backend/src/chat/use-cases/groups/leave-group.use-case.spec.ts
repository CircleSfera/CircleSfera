import { ErrorCode } from '@circlesfera/shared';
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
  let mockSuccession: {
    ensureAdmin: ReturnType<typeof vi.fn>;
    grantAdmin: ReturnType<typeof vi.fn>;
    announce: ReturnType<typeof vi.fn>;
    lock: ReturnType<typeof vi.fn>;
  };
  let transaction: ReturnType<typeof vi.fn>;

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
    mockSuccession = {
      ensureAdmin: vi.fn().mockResolvedValue(null),
      grantAdmin: vi.fn().mockResolvedValue({ id: 'notice-2' }),
      announce: vi.fn().mockResolvedValue(undefined),
      lock: vi.fn().mockResolvedValue(undefined),
    };
    // The leave and the naming of the next admin run in one transaction.
    transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma));
    (mockPrisma as unknown as { $transaction: unknown }).$transaction =
      transaction;
    useCase = new LeaveGroupUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
      mockSuccession as never,
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

  it('names the next admin in the same transaction, when the group would have none, and tells the group after', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ id: 'part-1' });
    mockPrisma.conversation.findUnique.mockResolvedValue(null);
    mockSuccession.ensureAdmin.mockResolvedValue({ id: 'notice-3' });

    await useCase.execute('prof-1', 'conv-1');

    expect(mockSuccession.grantAdmin).not.toHaveBeenCalled();
    expect(mockSuccession.ensureAdmin).toHaveBeenCalledWith(
      'conv-1',
      mockPrisma,
    );
    expect(
      mockPrisma.participant.delete.mock.invocationCallOrder[0],
    ).toBeLessThan(mockSuccession.ensureAdmin.mock.invocationCallOrder[0]);
    // The group is held first, so two admins leaving at once take turns.
    expect(mockSuccession.lock).toHaveBeenCalledWith('conv-1', mockPrisma);
    expect(mockSuccession.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.participant.delete.mock.invocationCallOrder[0],
    );
    expect(mockSuccession.announce).toHaveBeenCalledWith([
      null,
      { id: 'notice-3' },
    ]);
    expect(mockSuccession.announce.mock.invocationCallOrder[0]).toBeGreaterThan(
      transaction.mock.invocationCallOrder[0],
    );
  });

  it('an admin who names the next admin makes them admin and leaves, in one transaction', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      isAdmin: true,
    });
    mockPrisma.conversation.findUnique.mockResolvedValue(null);

    await useCase.execute('prof-1', 'conv-1', 'prof-2');

    expect(mockSuccession.grantAdmin).toHaveBeenCalledWith(
      'conv-1',
      'prof-2',
      mockPrisma,
    );
    expect(mockSuccession.grantAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.participant.delete.mock.invocationCallOrder[0],
    );
    // The fallback still runs; it names nobody while the group has an admin.
    expect(mockSuccession.ensureAdmin).toHaveBeenCalledWith(
      'conv-1',
      mockPrisma,
    );
    expect(mockSuccession.announce).toHaveBeenCalledWith([
      { id: 'notice-2' },
      null,
    ]);
  });

  it('does not leave when the member named may not be admin: both or neither', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      isAdmin: true,
    });
    mockSuccession.grantAdmin.mockRejectedValue(
      AppException.BadRequest(ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE),
    );

    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-9'),
    ).rejects.toMatchObject({ errorCode: ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE });
    expect(mockPrisma.participant.delete).not.toHaveBeenCalled();
    expect(mockSuccession.announce).not.toHaveBeenCalled();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('refuses naming oneself, and a member who is not admin naming anyone', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      isAdmin: true,
    });
    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-1'),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE,
      status: 400,
    });

    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      isAdmin: false,
    });
    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-2'),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.FORBIDDEN_ACCESS,
      status: 403,
    });

    expect(transaction).not.toHaveBeenCalled();
  });
});
