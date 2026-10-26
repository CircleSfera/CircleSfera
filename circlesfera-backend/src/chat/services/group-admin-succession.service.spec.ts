import { describe, expect, it, vi } from 'vitest';
import { ensureGroupAdmin } from './group-admin-succession.service.js';

function client({
  isGroup = true,
  admins = 0,
  next = { id: 'part-2', profileId: 'p-2' } as {
    id: string;
    profileId: string;
  } | null,
} = {}) {
  return {
    conversation: {
      findUnique: vi
        .fn()
        .mockResolvedValue(isGroup === null ? null : { isGroup }),
    },
    participant: {
      count: vi.fn().mockResolvedValue(admins),
      findFirst: vi.fn().mockResolvedValue(next),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('ensureGroupAdmin', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it('names the member who has been in the group longest, among those who may be admin', async () => {
    const c = client();

    await expect(ensureGroupAdmin(c as never, 'g-1', now)).resolves.toBe('p-2');

    expect(c.participant.count).toHaveBeenCalledWith({
      where: {
        conversationId: 'g-1',
        hasAccepted: true,
        deletedAt: null,
        isAdmin: true,
      },
    });
    expect(c.participant.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: 'g-1',
        hasAccepted: true,
        deletedAt: null,
        profile: {
          isAccountBanned: false,
          OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: now } }],
          user: {
            isActive: true,
            isRootBanned: false,
            deletedAt: null,
            scheduledDeletionAt: null,
          },
        },
      },
      // Longest in the group first; a tie never goes at random.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, profileId: true },
    });
    expect(c.participant.updateMany).toHaveBeenCalledWith({
      where: { id: 'part-2', deletedAt: null },
      data: { isAdmin: true },
    });
  });

  it('changes nothing while the group still has an admin', async () => {
    const c = client({ admins: 1 });

    await expect(ensureGroupAdmin(c as never, 'g-1', now)).resolves.toBeNull();
    expect(c.participant.findFirst).not.toHaveBeenCalled();
    expect(c.participant.updateMany).not.toHaveBeenCalled();
  });

  it('changes nothing in a 1:1 chat, or when no member may be admin', async () => {
    const direct = client({ isGroup: false });
    await expect(
      ensureGroupAdmin(direct as never, 'd-1', now),
    ).resolves.toBeNull();
    expect(direct.participant.count).not.toHaveBeenCalled();

    const nobody = client({ next: null });
    await expect(
      ensureGroupAdmin(nobody as never, 'g-1', now),
    ).resolves.toBeNull();
    expect(nobody.participant.updateMany).not.toHaveBeenCalled();
  });

  it('passes over a candidate who leaves at that very moment, for the next one', async () => {
    const c = client();
    c.participant.findFirst
      .mockResolvedValueOnce({ id: 'part-2', profileId: 'p-2' })
      .mockResolvedValueOnce({ id: 'part-3', profileId: 'p-3' });
    c.participant.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(ensureGroupAdmin(c as never, 'g-1', now)).resolves.toBe('p-3');
    expect(c.participant.findFirst.mock.calls[1][0].where.id).toEqual({
      notIn: ['part-2'],
    });
  });
});
