import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';
import { UpdateGroupUseCase } from './update-group.use-case.js';

describe('UpdateGroupUseCase', () => {
  let useCase: UpdateGroupUseCase;
  let mockPrisma: {
    participant: { findFirst: ReturnType<typeof vi.fn> };
    conversation: {
      update: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    block: { findMany: ReturnType<typeof vi.fn> };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };
  let storedFiles: {
    assertOwnedBy: ReturnType<typeof vi.fn>;
    namesStoredFileIndirectly: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = {
      participant: { findFirst: vi.fn() },
      conversation: {
        update: vi.fn(),
        findUnique: vi
          .fn()
          .mockResolvedValue({ avatarUrl: '/uploads/old.jpg' }),
      },
      block: { findMany: vi.fn().mockResolvedValue([]) },
    };
    storedFiles = {
      assertOwnedBy: vi.fn().mockResolvedValue(undefined),
      namesStoredFileIndirectly: vi.fn().mockReturnValue(false),
    };
    mockEventEmitter = { emit: vi.fn() };
    useCase = new UpdateGroupUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
      new ChatAuthorizationService(mockPrisma as unknown as PrismaService),
      storedFiles as never,
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

  it("keeps the group's current photo whoever set it, and refuses a new one that is not the admin's", async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ isAdmin: true });
    mockPrisma.conversation.update.mockResolvedValue({
      id: 'conv-1',
      participants: [],
    });

    await useCase.execute('prof-1', 'conv-1', 'Renamed', '/uploads/old.jpg');
    expect(storedFiles.assertOwnedBy).not.toHaveBeenCalled();

    storedFiles.assertOwnedBy.mockRejectedValueOnce(
      new Error('FILE_NOT_OWNED'),
    );
    mockPrisma.conversation.update.mockClear();
    await expect(
      useCase.execute('prof-1', 'conv-1', undefined, '/uploads/theirs.jpg'),
    ).rejects.toThrow('FILE_NOT_OWNED');
    expect(storedFiles.assertOwnedBy).toHaveBeenCalledWith('prof-1', [
      '/uploads/theirs.jpg',
    ]);
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it("refuses a photo given by another host's address with the path of a stored file, before any check or change", async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ isAdmin: true });
    storedFiles.namesStoredFileIndirectly.mockReturnValue(true);
    const crafted =
      'https://x.test/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg';

    await expect(
      useCase.execute('prof-1', 'conv-1', undefined, crafted),
    ).rejects.toMatchObject({ status: 400 });
    expect(storedFiles.namesStoredFileIndirectly).toHaveBeenCalledWith(crafted);
    expect(storedFiles.assertOwnedBy).not.toHaveBeenCalled();
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
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

  it('answers the admin with anyone in a block with them shown as unavailable', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ isAdmin: true });
    const updated = {
      id: 'conv-1',
      name: 'Trip',
      participants: [
        { profileId: 'prof-1', profile: { id: 'prof-1', username: 'me' } },
        { profileId: 'prof-2', profile: { id: 'prof-2', username: 'bob' } },
      ],
    };
    mockPrisma.conversation.update.mockResolvedValue(updated);
    mockPrisma.block.findMany.mockResolvedValue([
      { blockerId: 'prof-2', blockedId: 'prof-1' },
    ]);

    const result: any = await useCase.execute('prof-1', 'conv-1', 'Trip');

    expect(result.participants[1].profile).toEqual({
      id: 'prof-2',
      username: null,
      unavailable: true,
    });
    expect(result.participants[0].profile.username).toBe('me');
    // Every member is told; the socket masks it for each of them.
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'chat.conversation.updated',
      expect.objectContaining({ payload: updated }),
    );
  });
});
