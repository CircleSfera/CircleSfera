import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService, parseBroadcastLog } from './admin-users.service.js';

// An e-mail to everyone cannot be taken back: the staff member is told how
// many people it reaches, can try it on themselves, and sees what was sent.
describe('AdminUsersService: broadcasts', () => {
  const prisma = {
    user: { count: vi.fn(), findMany: vi.fn() },
    adminIdentity: { findUnique: vi.fn() },
    adminAuditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
  const email = { sendBroadcastEmail: vi.fn() };
  const dto = {
    subject: 'News',
    title: 'Hello',
    content: 'Body',
    buttonText: 'Open',
    buttonUrl: 'https://circlesfera.com',
  };
  const audience = {
    isActive: true,
    OR: [
      { settings: { is: null } },
      { settings: { emailNotifications: true } },
    ],
  };
  let service: AdminUsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    email.sendBroadcastEmail.mockResolvedValue(undefined);
    service = new AdminUsersService(
      prisma as never,
      email as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('counts the people a send reaches with the rule the send uses', async () => {
    prisma.user.count.mockResolvedValue(42);
    prisma.user.findMany.mockResolvedValue([]);

    await expect(service.countBroadcastRecipients()).resolves.toEqual({
      count: 42,
    });
    await service.sendBroadcastEmail('admin-1', dto);

    expect(prisma.user.count).toHaveBeenCalledWith({ where: audience });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual(audience);
  });

  it('sends a test only to the staff member who asks, and writes no send in the log', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValue({
      email: 'ana@staff.test',
    });

    await expect(service.sendBroadcastTest('admin-1', dto)).resolves.toEqual({
      sentTo: 'ana@staff.test',
    });

    expect(email.sendBroadcastEmail).toHaveBeenCalledTimes(1);
    expect(email.sendBroadcastEmail).toHaveBeenCalledWith(
      'ana@staff.test',
      'News',
      'Hello',
      'Body',
      'Open',
      'https://circlesfera.com',
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('sends no test for a staff member it does not know', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValue(null);

    await expect(service.sendBroadcastTest('gone', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(email.sendBroadcastEmail).not.toHaveBeenCalled();
  });

  it('lists what was sent, newest first, from the entry each send writes', async () => {
    const when = new Date('2026-03-10T11:00:00Z');
    prisma.adminAuditLog.findMany.mockResolvedValue([
      {
        id: 'log-2',
        details: 'Subject: Spring | news | Success: 40 | Failed: 2',
        createdAt: when,
        admin: { displayName: 'Ana Staff' },
      },
      { id: 'log-1', details: 'an older shape', createdAt: when, admin: null },
    ]);
    prisma.adminAuditLog.count.mockResolvedValue(12);

    const page = await service.getBroadcastHistory(2, 5);

    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetType: 'NEWSLETTER' },
        orderBy: { createdAt: 'desc' },
        skip: 5,
        take: 5,
      }),
    );
    expect(page.data).toEqual([
      {
        id: 'log-2',
        subject: 'Spring | news',
        sent: 40,
        failed: 2,
        sentBy: 'Ana Staff',
        createdAt: when,
      },
      {
        id: 'log-1',
        subject: 'an older shape',
        sent: null,
        failed: null,
        sentBy: null,
        createdAt: when,
      },
    ]);
    expect(page.meta).toEqual({ total: 12, page: 2, limit: 5, totalPages: 3 });
  });

  it('writes a send in the log in the shape the list reads', async () => {
    prisma.user.findMany
      .mockResolvedValueOnce([{ id: 'u1', email: 'a@example.com' }])
      .mockResolvedValueOnce([]);

    await service.sendBroadcastEmail('admin-1', dto);

    const details = prisma.adminAuditLog.create.mock.calls[0][0].data
      .details as string;
    expect(parseBroadcastLog(details)).toEqual({
      subject: 'News',
      sent: 1,
      failed: 0,
    });
    expect(parseBroadcastLog(null)).toEqual({
      subject: '',
      sent: null,
      failed: null,
    });
  });
});
