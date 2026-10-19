import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// What one staff member learns about an account stays for the next one.
describe('AdminUsersService: staff notes on an account', () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    staffNote: { findMany: vi.fn(), create: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };
  const when = new Date('2026-03-10T11:00:00Z');
  let service: AdminUsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminUsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('lists the notes of an account newest first, with who wrote each', async () => {
    prisma.staffNote.findMany.mockResolvedValue([
      {
        id: 'n2',
        body: 'Called us: the account is a shop',
        createdAt: when,
        author: { displayName: 'Ana Staff' },
      },
      // The staff identity that wrote it was deleted.
      { id: 'n1', body: 'Older', createdAt: when, author: null },
    ]);

    await expect(service.getStaffNotes('user-1')).resolves.toEqual([
      {
        id: 'n2',
        body: 'Called us: the account is a shop',
        createdAt: when,
        author: 'Ana Staff',
      },
      { id: 'n1', body: 'Older', createdAt: when, author: null },
    ]);
    expect(prisma.staffNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('reads the notes a page at a time, newest first, after the last note of the page before', async () => {
    const older = new Date('2026-03-09T11:00:00Z');
    prisma.staffNote.findMany.mockResolvedValueOnce([
      { id: 'n3', body: 'Third', createdAt: when, author: null },
      { id: 'n2', body: 'Second', createdAt: older, author: null },
      { id: 'n1', body: 'First', createdAt: older, author: null },
    ]);

    const first = await service.getStaffNotesPage('user-1', undefined, 2);

    expect(first.items.map((n) => n.id)).toEqual(['n3', 'n2']);
    expect(prisma.staffNote.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
    );

    prisma.staffNote.findMany.mockResolvedValueOnce([
      { id: 'n1', body: 'First', createdAt: older, author: null },
    ]);
    const second = await service.getStaffNotesPage(
      'user-1',
      first.nextCursor ?? '',
      2,
    );

    expect(prisma.staffNote.findMany.mock.calls[1][0].where).toEqual({
      userId: 'user-1',
      OR: [
        { createdAt: { lt: older } },
        { createdAt: older, id: { lt: 'n2' } },
      ],
    });
    expect(second).toEqual({
      items: [{ id: 'n1', body: 'First', createdAt: older, author: null }],
      nextCursor: null,
    });
  });

  it('starts the notes from the top when the cursor is not one it wrote, and keeps a page within bounds', async () => {
    prisma.staffNote.findMany.mockResolvedValue([]);

    await service.getStaffNotesPage('user-1', 'not-a-cursor');
    await service.getStaffNotesPage('user-1', undefined, 500);
    await service.getStaffNotesPage('user-1', undefined, 0);

    const calls = prisma.staffNote.findMany.mock.calls;
    expect(calls[0][0].where).toEqual({ userId: 'user-1' });
    expect(calls.map((c) => c[0].take)).toEqual([31, 51, 2]);
  });

  it('adds a note signed by the staff member, and changes nothing else', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.staffNote.create.mockResolvedValue({
      id: 'n3',
      body: 'A shop',
      createdAt: when,
      author: { displayName: 'Ana Staff' },
    });

    await expect(
      service.addStaffNote('admin-1', 'user-1', 'A shop'),
    ).resolves.toEqual({
      id: 'n3',
      body: 'A shop',
      createdAt: when,
      author: 'Ana Staff',
    });
    expect(prisma.staffNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: 'user-1', authorId: 'admin-1', body: 'A shop' },
      }),
    );
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('adds no note to an account that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.addStaffNote('admin-1', 'gone', 'A shop'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.staffNote.create).not.toHaveBeenCalled();
  });
});
