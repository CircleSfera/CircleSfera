import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import { AcceptMessageRequestUseCase } from './accept-message-request.use-case.js';

describe('AcceptMessageRequestUseCase', () => {
  let useCase: AcceptMessageRequestUseCase;
  const mockPrisma = {
    participant: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new AcceptMessageRequestUseCase(mockPrisma as any);
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

  it('updates hasAccepted and lastReadAt if hasAccepted is false', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      profileId: 'profile-1',
      conversationId: 'conv-1',
      deletedAt: null,
      hasAccepted: false,
    });
    mockPrisma.participant.update.mockResolvedValue({
      id: 'part-1',
      hasAccepted: true,
    });

    const result = await useCase.execute('profile-1', 'conv-1');

    expect(result).toEqual({ success: true });
    expect(mockPrisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'part-1' },
      data: expect.objectContaining({
        hasAccepted: true,
        lastReadAt: expect.any(Date),
      }),
    });
  });

  it('is idempotent if already accepted', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      profileId: 'profile-1',
      conversationId: 'conv-1',
      deletedAt: null,
      hasAccepted: true,
    });

    const result = await useCase.execute('profile-1', 'conv-1');

    expect(result).toEqual({ success: true });
    expect(mockPrisma.participant.update).not.toHaveBeenCalled();
  });
});
