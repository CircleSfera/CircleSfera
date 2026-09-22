import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { MarkAsReadUseCase } from './mark-as-read.use-case.js';

describe('MarkAsReadUseCase', () => {
  let useCase: MarkAsReadUseCase;
  let mockPrisma: {
    participant: {
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      participant: {
        updateMany: vi.fn(),
      },
    };
    useCase = new MarkAsReadUseCase(mockPrisma as unknown as PrismaService);
  });

  it('updates lastReadAt for the participant in the conversation', async () => {
    mockPrisma.participant.updateMany.mockResolvedValue({ count: 1 });

    await useCase.execute('conv-1', 'profile-1');

    expect(mockPrisma.participant.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'conv-1',
        profileId: 'profile-1',
      },
      data: {
        lastReadAt: expect.any(Date),
      },
    });
  });
});
