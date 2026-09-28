import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import { DeclineMessageRequestUseCase } from './decline-message-request.use-case.js';

describe('DeclineMessageRequestUseCase', () => {
  let useCase: DeclineMessageRequestUseCase;
  const mockPrisma = {
    participant: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new DeclineMessageRequestUseCase(mockPrisma as any);
  });

  it('throws NotFound if participant does not exist', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    await expect(useCase.execute('profile-1', 'conv-1')).rejects.toThrow(
      AppException,
    );
  });

  it('throws NotFound if participant is deleted', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      profileId: 'profile-1',
      conversationId: 'conv-1',
      deletedAt: new Date(),
      hasAccepted: false,
    });

    await expect(useCase.execute('profile-1', 'conv-1')).rejects.toThrow(
      AppException,
    );
  });

  it('sets deletedAt and clearedAt on the participant', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      profileId: 'profile-1',
      conversationId: 'conv-1',
      deletedAt: null,
      hasAccepted: false,
    });
    mockPrisma.participant.update.mockResolvedValue({
      id: 'part-1',
    });

    const result = await useCase.execute('profile-1', 'conv-1');

    expect(result).toEqual({ success: true });
    expect(mockPrisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'part-1' },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        clearedAt: expect.any(Date),
      }),
    });
  });
});
