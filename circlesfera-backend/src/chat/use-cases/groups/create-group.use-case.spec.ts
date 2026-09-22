import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { CreateGroupUseCase } from './create-group.use-case.js';

describe('CreateGroupUseCase', () => {
  let useCase: CreateGroupUseCase;
  let mockPrisma: {
    block: { findMany: ReturnType<typeof vi.fn> };
    conversation: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      block: { findMany: vi.fn().mockResolvedValue([]) },
      conversation: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };
    mockEventEmitter = { emit: vi.fn() };
    useCase = new CreateGroupUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('throws BadRequest when attempting to create a conversation only with oneself', async () => {
    await expect(useCase.execute('prof-1', ['prof-1'])).rejects.toThrow(
      AppException,
    );
  });

  it('throws Forbidden when user or target participant is blocked', async () => {
    mockPrisma.block.findMany.mockResolvedValue([{ id: 'block-1' }]);

    await expect(useCase.execute('prof-1', ['prof-2'])).rejects.toThrow(
      AppException,
    );
  });

  it('returns existing 1-on-1 conversation when it already exists and name is not specified', async () => {
    const existing = { id: 'conv-1on1', isGroup: false };
    mockPrisma.conversation.findFirst.mockResolvedValue(existing);

    const result = await useCase.execute('prof-1', ['prof-2']);

    expect(result).toBe(existing);
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });

  it('creates new 1-on-1 conversation when none exists and name is not specified', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const created = { id: 'conv-new-1on1', isGroup: false };
    mockPrisma.conversation.create.mockResolvedValue(created);

    const result = await useCase.execute('prof-1', ['prof-2']);

    expect(result).toBe(created);
    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
      data: {
        isGroup: false,
        participants: {
          create: [{ profileId: 'prof-1' }, { profileId: 'prof-2' }],
        },
      },
      include: expect.any(Object),
    });
  });

  it('creates a group conversation with admin role for caller and emits event', async () => {
    const createdGroup = {
      id: 'conv-group-1',
      isGroup: true,
      name: 'Engineering',
      participants: [
        { profileId: 'prof-1', isAdmin: true },
        { profileId: 'prof-2', isAdmin: false },
        { profileId: 'prof-3', isAdmin: false },
      ],
    };
    mockPrisma.conversation.create.mockResolvedValue(createdGroup);

    const result = await useCase.execute(
      'prof-1',
      ['prof-2', 'prof-3'],
      'Engineering',
    );

    expect(result).toBe(createdGroup);
    expect(mockPrisma.conversation.create).toHaveBeenCalledWith({
      data: {
        isGroup: true,
        name: 'Engineering',
        participants: {
          create: [
            { profileId: 'prof-1', isAdmin: true },
            { profileId: 'prof-2', isAdmin: false },
            { profileId: 'prof-3', isAdmin: false },
          ],
        },
      },
      include: expect.any(Object),
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.created',
      { conversation: createdGroup },
    );
  });
});
