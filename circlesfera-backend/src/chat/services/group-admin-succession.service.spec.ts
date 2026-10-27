import { ErrorCode } from '@circlesfera/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  type AdminNotice,
  announceAdminNotices,
  ensureGroupAdmin,
  GroupAdminSuccessionService,
  grantGroupAdmin,
  lockGroup,
  mayBeGroupAdmin,
} from './group-admin-succession.service.js';

const notice = (profileId: string, conversationId = 'g-1') =>
  ({
    id: `notice-${profileId}`,
    conversationId,
    senderId: profileId,
    content: '',
    kind: 'ADMIN_GRANTED',
    sender: { id: profileId, username: profileId, avatar: null },
  }) as unknown as AdminNotice;

function client({
  isGroup = true,
  admins = 0,
  next = { id: 'part-2', profileId: 'p-2' } as {
    id: string;
    profileId: string;
    isAdmin?: boolean;
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
      findMany: vi.fn().mockResolvedValue([]),
    },
    message: {
      create: vi.fn(({ data }: { data: { senderId: string } }) =>
        Promise.resolve(notice(data.senderId)),
      ),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
}

describe('mayBeGroupAdmin', () => {
  it('is a member still in the group, who accepted it, with an active account', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(mayBeGroupAdmin('g-1', now)).toEqual({
      conversationId: 'g-1',
      hasAccepted: true,
      deletedAt: null,
      conversation: { isGroup: true },
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
    });
  });
});

describe('ensureGroupAdmin', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it('names the member who has been in the group longest, among those who may be admin, and tells the group', async () => {
    const c = client();

    await expect(ensureGroupAdmin(c as never, 'g-1', now)).resolves.toEqual(
      notice('p-2'),
    );

    expect(c.participant.count).toHaveBeenCalledWith({
      where: {
        conversationId: 'g-1',
        hasAccepted: true,
        deletedAt: null,
        isAdmin: true,
      },
    });
    expect(c.participant.findFirst).toHaveBeenCalledWith({
      where: mayBeGroupAdmin('g-1', now),
      // Longest in the group first; a tie never goes at random.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, profileId: true },
    });
    expect(c.participant.updateMany).toHaveBeenCalledWith({
      // Only a member who is not admin yet: two promotions, one notice.
      where: { id: 'part-2', deletedAt: null, isAdmin: false },
      data: { isAdmin: true },
    });
    // The notice names the new admin as its subject and holds no text: each
    // reader writes it out in their own language.
    expect(c.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'g-1',
        senderId: 'p-2',
        content: '',
        kind: 'ADMIN_GRANTED',
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });
  });

  it('changes nothing while the group still has an admin', async () => {
    const c = client({ admins: 1 });

    await expect(ensureGroupAdmin(c as never, 'g-1', now)).resolves.toBeNull();
    expect(c.participant.findFirst).not.toHaveBeenCalled();
    expect(c.participant.updateMany).not.toHaveBeenCalled();
    expect(c.message.create).not.toHaveBeenCalled();
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
    expect(nobody.message.create).not.toHaveBeenCalled();
  });

  it('passes over a candidate who leaves at that very moment, for the next one', async () => {
    const c = client();
    c.participant.findFirst
      .mockResolvedValueOnce({ id: 'part-2', profileId: 'p-2' })
      // Their row is gone: they left.
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'part-3', profileId: 'p-3' });
    c.participant.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(ensureGroupAdmin(c as never, 'g-1', now)).resolves.toEqual(
      notice('p-3'),
    );
    expect(c.participant.findFirst.mock.calls[1][0]).toEqual({
      where: { id: 'part-2', deletedAt: null },
      select: { isAdmin: true },
    });
    expect(c.participant.findFirst.mock.calls[2][0].where.id).toEqual({
      notIn: ['part-2'],
    });
    // Only the member who did become admin is announced.
    expect(c.message.create).toHaveBeenCalledTimes(1);
  });

  it('gives up after five candidates who all leave at that moment', async () => {
    const c = client();
    c.participant.updateMany.mockResolvedValue({ count: 0 });

    await expect(ensureGroupAdmin(c as never, 'g-1', now)).resolves.toBeNull();
    // Five candidates, each looked up again once its promotion missed.
    expect(c.participant.findFirst).toHaveBeenCalledTimes(10);
    expect(c.message.create).not.toHaveBeenCalled();
  });

  it('names nobody else when another promotion made the candidate admin at that moment', async () => {
    const c = client();
    c.participant.findFirst
      .mockResolvedValueOnce({ id: 'part-2', profileId: 'p-2' })
      .mockResolvedValueOnce({ isAdmin: true });
    c.participant.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(ensureGroupAdmin(c as never, 'g-1', now)).resolves.toBeNull();
    expect(c.participant.updateMany).toHaveBeenCalledTimes(1);
    expect(c.message.create).not.toHaveBeenCalled();
  });
});

describe('lockGroup', () => {
  it("holds the group's row for the rest of the transaction", async () => {
    const c = client();

    await lockGroup(c as never, 'g-1');

    const [strings, id] = c.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toBe(
      'SELECT id FROM "conversations" WHERE id = ? FOR UPDATE',
    );
    expect(id).toBe('g-1');
  });
});

describe('grantGroupAdmin', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it('makes a member who may be admin an admin, and tells the group', async () => {
    const c = client({
      next: { id: 'part-4', profileId: 'p-4', isAdmin: false },
    });

    await expect(
      grantGroupAdmin(c as never, 'g-1', 'p-4', now),
    ).resolves.toEqual(notice('p-4'));
    expect(c.participant.findFirst).toHaveBeenCalledWith({
      where: { ...mayBeGroupAdmin('g-1', now), profileId: 'p-4' },
      select: { id: true, profileId: true, isAdmin: true },
    });
    expect(c.participant.updateMany).toHaveBeenCalledWith({
      where: { id: 'part-4', deletedAt: null, isAdmin: false },
      data: { isAdmin: true },
    });
  });

  it('changes nothing for a member who is admin already', async () => {
    const c = client({
      next: { id: 'part-4', profileId: 'p-4', isAdmin: true },
    });

    await expect(
      grantGroupAdmin(c as never, 'g-1', 'p-4', now),
    ).resolves.toBeNull();
    expect(c.participant.updateMany).not.toHaveBeenCalled();
    expect(c.message.create).not.toHaveBeenCalled();
  });

  it('refuses a member who may not be admin, or who left at that very moment', async () => {
    const outsider = client({ next: null });
    await expect(
      grantGroupAdmin(outsider as never, 'g-1', 'p-9', now),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE,
      status: 400,
    });

    const gone = client({
      next: { id: 'part-4', profileId: 'p-4', isAdmin: false },
    });
    gone.participant.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      grantGroupAdmin(gone as never, 'g-1', 'p-4', now),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE,
      status: 400,
    });
    expect(gone.message.create).not.toHaveBeenCalled();
  });

  it('writes no second notice when another admin made the member admin at that moment', async () => {
    const c = client({
      next: { id: 'part-4', profileId: 'p-4', isAdmin: false },
    });
    c.participant.updateMany.mockResolvedValue({ count: 0 });
    c.participant.findFirst
      .mockResolvedValueOnce({ id: 'part-4', profileId: 'p-4', isAdmin: false })
      .mockResolvedValueOnce({ isAdmin: true });

    await expect(
      grantGroupAdmin(c as never, 'g-1', 'p-4', now),
    ).resolves.toBeNull();
    expect(c.message.create).not.toHaveBeenCalled();
  });
});

describe('announceAdminNotices', () => {
  it('sends each notice to everyone in its group over the message channel, and skips none given', async () => {
    const c = client();
    c.participant.findMany.mockResolvedValue([
      { profileId: 'p-1' },
      { profileId: 'p-2' },
    ]);
    const events = { emit: vi.fn() };

    await announceAdminNotices(c as never, events as never, [
      null,
      notice('p-2'),
      undefined,
    ]);

    expect(c.participant.findMany).toHaveBeenCalledTimes(1);
    expect(c.participant.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'g-1' },
      select: { profileId: true },
    });
    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('chat.message.sent', {
      participants: [{ profileId: 'p-1' }, { profileId: 'p-2' }],
      payload: notice('p-2'),
    });
  });
});

describe('announceAdminNotices when sending fails', () => {
  it('logs the notice and still sends the next one, without failing the change', async () => {
    const c = client();
    c.participant.findMany
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce([{ profileId: 'p-3' }]);
    const events = { emit: vi.fn() };

    await expect(
      announceAdminNotices(c as never, events as never, [
        notice('p-2'),
        notice('p-3', 'g-2'),
      ]),
    ).resolves.toBeUndefined();

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('chat.message.sent', {
      participants: [{ profileId: 'p-3' }],
      payload: notice('p-3', 'g-2'),
    });
  });
});

describe('GroupAdminSuccessionService', () => {
  it('runs each step on the client given, or on its own', async () => {
    const own = client();
    const tx = client({
      next: { id: 'part-4', profileId: 'p-4', isAdmin: false },
    });
    const events = { emit: vi.fn() };
    const service = new GroupAdminSuccessionService(
      own as never,
      events as never,
    );
    const now = new Date('2026-10-26T12:00:00Z');

    await expect(service.ensureAdmin('g-1')).resolves.toEqual(notice('p-2'));
    await expect(service.ensureAdmin('g-1', tx as never, now)).resolves.toEqual(
      notice('p-4'),
    );
    await expect(service.grantAdmin('g-1', 'p-2')).resolves.toEqual(
      notice('p-2'),
    );
    await expect(
      service.grantAdmin('g-1', 'p-4', tx as never, now),
    ).resolves.toEqual(notice('p-4'));

    await service.lock('g-1', tx as never);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

    await service.announce([notice('p-4')]);
    expect(own.participant.findMany).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'chat.message.sent',
      expect.objectContaining({ payload: notice('p-4') }),
    );
  });
});
