import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { AddReactionUseCase } from './add-reaction.use-case.js';

describe('AddReactionUseCase', () => {
  let useCase: AddReactionUseCase;
  let mockPrisma: {
    message: { findUnique: ReturnType<typeof vi.fn> };
    block: { findFirst: ReturnType<typeof vi.fn> };
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
      block: { findFirst: vi.fn().mockResolvedValue(null) },
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

  it('refuses a reaction to a notice from the app', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'notice-1',
      kind: 'ADMIN_GRANTED',
      conversation: { participants: [{ profileId: 'prof-1' }] },
    });

    await expect(
      useCase.execute('notice-1', 'prof-1', '❤️'),
    ).rejects.toMatchObject({ errorCode: 'MESSAGE_IS_NOTICE', status: 400 });
    expect(mockPrisma.messageReaction.create).not.toHaveBeenCalled();
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
  describe('across a block', () => {
    const inGroup = {
      id: 'msg-1',
      kind: 'USER',
      conversation: {
        participants: [
          { profileId: 'prof-1' },
          { profileId: 'prof-2' },
          { profileId: 'prof-3' },
        ],
      },
    };

    it('refuses a new reaction when the reactor and another participant are blocked either way', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(inGroup);
      mockPrisma.messageReaction.findUnique.mockResolvedValue(null);
      mockPrisma.block.findFirst.mockResolvedValue({ id: 'b1' });

      await expect(useCase.execute('msg-1', 'prof-1', '❤️')).rejects.toThrow(
        'Cannot react',
      );
      expect(mockPrisma.block.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: 'prof-1', blockedId: { in: ['prof-2', 'prof-3'] } },
            { blockedId: 'prof-1', blockerId: { in: ['prof-2', 'prof-3'] } },
          ],
        },
        select: { id: true },
      });
      expect(mockPrisma.messageReaction.create).not.toHaveBeenCalled();
    });

    it('refuses changing a reaction across a block', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(inGroup);
      mockPrisma.messageReaction.findUnique.mockResolvedValue({
        id: 'r1',
        reaction: '👍',
      });
      mockPrisma.block.findFirst.mockResolvedValue({ id: 'b1' });

      await expect(useCase.execute('msg-1', 'prof-1', '❤️')).rejects.toThrow(
        'Cannot react',
      );
      expect(mockPrisma.messageReaction.update).not.toHaveBeenCalled();
    });

    it('still lets a reaction be taken back', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(inGroup);
      mockPrisma.messageReaction.findUnique.mockResolvedValue({
        id: 'r1',
        reaction: '❤️',
        createdAt: new Date(),
      });
      mockPrisma.block.findFirst.mockResolvedValue({ id: 'b1' });

      await useCase.execute('msg-1', 'prof-1', '❤️');

      expect(mockPrisma.block.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.messageReaction.delete).toHaveBeenCalledWith({
        where: { id: 'r1' },
      });
    });
  });
});
