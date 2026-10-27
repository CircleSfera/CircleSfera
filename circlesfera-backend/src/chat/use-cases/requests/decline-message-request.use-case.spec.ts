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

  const mockLeaveGroup = { execute: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new DeclineMessageRequestUseCase(
      mockPrisma as any,
      mockLeaveGroup as any,
    );
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
      conversation: { isGroup: false },
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

  it.each([
    ['a pending group invitation', false, true],
    ['an accepted one-to-one chat', true, false],
  ])('hides %s from the Profile only', async (_name, hasAccepted, isGroup) => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      profileId: 'profile-1',
      conversationId: 'conv-1',
      deletedAt: null,
      hasAccepted,
      conversation: { isGroup },
    });

    await expect(useCase.execute('profile-1', 'conv-1')).resolves.toEqual({
      success: true,
    });

    expect(mockLeaveGroup.execute).not.toHaveBeenCalled();
    expect(mockPrisma.participant.update).toHaveBeenCalledWith({
      where: { id: 'part-1' },
      data: { deletedAt: expect.any(Date), clearedAt: expect.any(Date) },
    });
  });

  it('leaves a group the Profile had already accepted, as leaving it does', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: 'part-1',
      profileId: 'profile-1',
      conversationId: 'conv-1',
      deletedAt: null,
      hasAccepted: true,
      conversation: { isGroup: true },
    });
    mockLeaveGroup.execute.mockResolvedValue({ success: true });

    await expect(useCase.execute('profile-1', 'conv-1')).resolves.toEqual({
      success: true,
    });

    expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', profileId: 'profile-1' },
      include: { conversation: { select: { isGroup: true } } },
    });
    expect(mockLeaveGroup.execute).toHaveBeenCalledWith('profile-1', 'conv-1');
    expect(mockPrisma.participant.update).not.toHaveBeenCalled();
  });
});
