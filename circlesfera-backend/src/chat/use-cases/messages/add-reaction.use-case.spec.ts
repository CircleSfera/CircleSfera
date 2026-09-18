import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { AddReactionUseCase } from './add-reaction.use-case.js';

describe('AddReactionUseCase', () => {
  let useCase: AddReactionUseCase;
  let mockPrisma: {
    message: { findUnique: ReturnType<typeof vi.fn> };
    messageReaction: {
      findUnique: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      message: { findUnique: vi.fn() },
      messageReaction: {
        findUnique: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    useCase = new AddReactionUseCase(mockPrisma as unknown as PrismaService);
  });

  it('throws NotFound if message does not exist', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('msg-1', 'prof-1', '❤️')).rejects.toThrow(
      AppException,
    );
  });

  it('throws Forbidden if caller is not a conversation participant', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversation: {
        participants: [{ profileId: 'other-user' }],
      },
    });

    await expect(useCase.execute('msg-1', 'prof-1', '❤️')).rejects.toThrow(
      AppException,
    );
  });

  it('removes reaction if the same reaction already exists', async () => {
    const createdAt = new Date();
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversation: {
        participants: [{ profileId: 'prof-1' }],
      },
    });
    mockPrisma.messageReaction.findUnique.mockResolvedValue({
      id: 'react-1',
      reaction: '❤️',
      createdAt,
    });
    mockPrisma.messageReaction.delete.mockResolvedValue({ id: 'react-1' });

    const result = await useCase.execute('msg-1', 'prof-1', '❤️');

    expect(mockPrisma.messageReaction.delete).toHaveBeenCalledWith({
      where: { id: 'react-1' },
    });
    expect(result).toEqual({
      id: 'react-1',
      messageId: 'msg-1',
      profileId: 'prof-1',
      reaction: null,
      createdAt,
    });
  });

  it('updates reaction if a different reaction already exists', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversation: {
        participants: [{ profileId: 'prof-1' }],
      },
    });
    mockPrisma.messageReaction.findUnique.mockResolvedValue({
      id: 'react-1',
      reaction: '❤️',
    });
    const updated = {
      id: 'react-1',
      reaction: '👍',
      profileId: 'prof-1',
      messageId: 'msg-1',
    };
    mockPrisma.messageReaction.update.mockResolvedValue(updated);

    const result = await useCase.execute('msg-1', 'prof-1', '👍');

    expect(mockPrisma.messageReaction.update).toHaveBeenCalledWith({
      where: { id: 'react-1' },
      data: { reaction: '👍' },
    });
    expect(result).toEqual(updated);
  });

  it('creates new reaction if none exists', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversation: {
        participants: [{ profileId: 'prof-1' }],
      },
    });
    mockPrisma.messageReaction.findUnique.mockResolvedValue(null);
    const created = {
      id: 'react-new',
      reaction: '🔥',
      profileId: 'prof-1',
      messageId: 'msg-1',
    };
    mockPrisma.messageReaction.create.mockResolvedValue(created);

    const result = await useCase.execute('msg-1', 'prof-1', '🔥');

    expect(mockPrisma.messageReaction.create).toHaveBeenCalledWith({
      data: {
        messageId: 'msg-1',
        profileId: 'prof-1',
        reaction: '🔥',
      },
    });
    expect(result).toEqual(created);
  });
});
