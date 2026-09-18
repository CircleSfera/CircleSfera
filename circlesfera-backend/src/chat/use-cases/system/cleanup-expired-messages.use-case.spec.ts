import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { CleanupExpiredMessagesUseCase } from './cleanup-expired-messages.use-case.js';

describe('CleanupExpiredMessagesUseCase', () => {
  let useCase: CleanupExpiredMessagesUseCase;
  let mockPrisma: {
    message: {
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      message: {
        deleteMany: vi.fn(),
      },
    };
    useCase = new CleanupExpiredMessagesUseCase(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('deletes expired messages and returns count when count > 0', async () => {
    mockPrisma.message.deleteMany.mockResolvedValue({ count: 12 });

    const result = await useCase.execute();

    expect(result).toEqual({ count: 12 });
    expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: expect.any(Date) },
      },
    });
  });

  it('deletes expired messages and returns count when count is 0', async () => {
    mockPrisma.message.deleteMany.mockResolvedValue({ count: 0 });

    const result = await useCase.execute();

    expect(result).toEqual({ count: 0 });
  });

  it('logs and rethrows when deleteMany fails', async () => {
    const dbError = new Error('Database connection failed');
    mockPrisma.message.deleteMany.mockRejectedValue(dbError);

    await expect(useCase.execute()).rejects.toThrow(
      'Database connection failed',
    );
  });
});
