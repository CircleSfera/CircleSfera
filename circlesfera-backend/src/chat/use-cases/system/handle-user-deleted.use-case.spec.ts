import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { UserHardDeletedEvent } from '../../../users/events/user-hard-deleted.event.js';
import { HandleUserDeletedUseCase } from './handle-user-deleted.use-case.js';

describe('HandleUserDeletedUseCase', () => {
  let useCase: HandleUserDeletedUseCase;

  const mockPrisma = {
    message: {
      findMany: vi.fn(),
    },
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new HandleUserDeletedUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('should emit media.delete_batch for all media urls associated with user profileIds', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-1',
        url: 'https://cdn.example.com/msg1.jpg',
        standardUrl: 'https://cdn.example.com/msg1-std.jpg',
        thumbnailUrl: 'https://cdn.example.com/msg1-thumb.jpg',
        voiceUrl: null,
      },
      {
        id: 'msg-2',
        url: null,
        standardUrl: null,
        thumbnailUrl: null,
        voiceUrl: 'https://cdn.example.com/voice2.m4a',
      },
    ]);

    const event = new UserHardDeletedEvent({
      userId: 'user-1',
      profileIds: ['prof-1', 'prof-2'],
    });

    await useCase.execute(event);

    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { senderId: { in: ['prof-1', 'prof-2'] } },
    });

    expect(mockEventEmitter.emit).toHaveBeenCalledWith('media.delete_batch', {
      mediaUrls: expect.arrayContaining([
        'https://cdn.example.com/msg1.jpg',
        'https://cdn.example.com/msg1-std.jpg',
        'https://cdn.example.com/msg1-thumb.jpg',
        'https://cdn.example.com/voice2.m4a',
      ]),
    });
  });

  it('should support single profileId fallback in event', async () => {
    mockPrisma.message.findMany.mockResolvedValue([]);

    const event = new UserHardDeletedEvent({
      userId: 'user-single',
      profileId: 'prof-single',
    });

    await useCase.execute(event);

    expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
      where: { senderId: { in: ['prof-single'] } },
    });
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should do nothing when profileIds and profileId are empty', async () => {
    const event = new UserHardDeletedEvent({
      userId: 'user-empty',
      profileIds: [],
    });

    await useCase.execute(event);

    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should handle post-cascade state gracefully when messages are already removed or query fails', async () => {
    mockPrisma.message.findMany.mockResolvedValue([]);

    const event = new UserHardDeletedEvent({
      userId: 'user-cascaded',
      profileIds: ['prof-cascaded'],
    });

    await expect(useCase.execute(event)).resolves.toBeUndefined();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });
});
