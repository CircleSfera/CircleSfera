import { ErrorCode } from '@circlesfera/shared';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';
import { MakeGroupAdminUseCase } from './make-group-admin.use-case.js';

describe('MakeGroupAdminUseCase', () => {
  let useCase: MakeGroupAdminUseCase;
  let mockPrisma: {
    participant: { findFirst: ReturnType<typeof vi.fn> };
    conversation: { findUnique: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };
  let mockSuccession: {
    grantAdmin: ReturnType<typeof vi.fn>;
    announce: ReturnType<typeof vi.fn>;
    lock: ReturnType<typeof vi.fn>;
  };
  const updatedConv = {
    id: 'conv-1',
    participants: [{ profileId: 'prof-1' }, { profileId: 'prof-2' }],
  };

  beforeEach(() => {
    mockPrisma = {
      participant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'part-1', isAdmin: true }),
      },
      conversation: { findUnique: vi.fn().mockResolvedValue(updatedConv) },
      $transaction: vi.fn(),
    };
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(mockPrisma),
    );
    mockEventEmitter = { emit: vi.fn() };
    mockSuccession = {
      grantAdmin: vi.fn().mockResolvedValue({ id: 'notice-2' }),
      announce: vi.fn().mockResolvedValue(undefined),
      lock: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new MakeGroupAdminUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
      new ChatAuthorizationService(mockPrisma as unknown as PrismaService),
      mockSuccession as never,
    );
  });

  it('refuses anyone who is not an admin of the group', async () => {
    mockPrisma.participant.findFirst.mockResolvedValueOnce(null);
    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-2'),
    ).rejects.toMatchObject({ status: 403 });

    mockPrisma.participant.findFirst.mockResolvedValueOnce({ isAdmin: false });
    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-2'),
    ).rejects.toMatchObject({ status: 403 });

    expect(mockSuccession.grantAdmin).not.toHaveBeenCalled();
  });

  it('makes the member admin, updates the group for everyone in it and tells them', async () => {
    const result = await useCase.execute('prof-1', 'conv-1', 'prof-2');

    expect(result).toEqual(updatedConv);
    expect(mockSuccession.grantAdmin).toHaveBeenCalledWith(
      'conv-1',
      'prof-2',
      mockPrisma,
    );
    expect(mockSuccession.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mockSuccession.grantAdmin.mock.invocationCallOrder[0],
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.updated',
      { participants: updatedConv.participants, payload: updatedConv },
    );
    expect(mockSuccession.announce).toHaveBeenCalledWith([{ id: 'notice-2' }]);
  });

  it('changes nothing for a member who is admin already', async () => {
    mockSuccession.grantAdmin.mockResolvedValue(null);

    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-2'),
    ).resolves.toEqual(updatedConv);
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    expect(mockSuccession.announce).toHaveBeenCalledWith([null]);
  });

  it('passes on the refusal of a member who may not be admin', async () => {
    mockSuccession.grantAdmin.mockRejectedValue(
      AppException.BadRequest(ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE),
    );

    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-9'),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE,
      status: 400,
    });
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    expect(mockSuccession.announce).not.toHaveBeenCalled();
  });

  it('does not tell anyone about a group that is gone by then, but still announces the notice', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute('prof-1', 'conv-1', 'prof-2'),
    ).resolves.toBeNull();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    expect(mockSuccession.announce).toHaveBeenCalledWith([{ id: 'notice-2' }]);
  });
});
