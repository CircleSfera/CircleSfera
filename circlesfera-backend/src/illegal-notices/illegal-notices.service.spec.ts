import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IllegalNoticesService,
  noticeReference,
} from './illegal-notices.service.js';

describe('IllegalNoticesService', () => {
  const prisma = {
    illegalContentNotice: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    adminAuditLog: { create: vi.fn() },
  };
  const email = {
    sendNoticeReceivedEmail: vi.fn(),
    sendNoticeDecidedEmail: vi.fn(),
  };
  const config = {
    get: (key: string) =>
      key === 'FRONTEND_URL' ? 'https://circlesfera.com' : undefined,
  } as unknown as ConfigService;
  let service: IllegalNoticesService;

  const stored = {
    id: 'abcdef12-0000-4000-8000-000000000000',
    contentUrl: 'https://circlesfera.com/p/1',
    notifierEmail: 'ana@example.com',
    locale: 'es',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IllegalNoticesService(
      prisma as never,
      email as never,
      config,
    );
    email.sendNoticeReceivedEmail.mockResolvedValue(undefined);
    email.sendNoticeDecidedEmail.mockResolvedValue(undefined);
  });

  it('knows the addresses of CircleSfera, and only those', () => {
    expect(service.isOwnAddress('https://circlesfera.com/p/1')).toBe(true);
    expect(service.isOwnAddress('https://www.circlesfera.com/p/1')).toBe(true);
    expect(service.isOwnAddress('https://evil.example/circlesfera.com')).toBe(
      false,
    );
    expect(service.isOwnAddress('https://circlesfera.com.evil.example/')).toBe(
      false,
    );
    expect(service.isOwnAddress('nonsense')).toBe(false);
  });

  it('stores a notice and sends the receipt with its reference', async () => {
    prisma.illegalContentNotice.create.mockResolvedValue(stored);

    const res = await service.create({
      contentUrl: ' https://circlesfera.com/p/1 ',
      explanation: ' It sells counterfeit medicines to anyone. ',
      notifierName: 'Ana',
      notifierEmail: 'Ana@Example.com',
      goodFaith: true,
      locale: 'es',
    });

    expect(res).toEqual({ reference: noticeReference(stored.id) });
    expect(res.reference).toBe('ABCDEF12');
    expect(prisma.illegalContentNotice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentUrl: 'https://circlesfera.com/p/1',
        explanation: 'It sells counterfeit medicines to anyone.',
        notifierEmail: 'ana@example.com',
        childAbuse: false,
        goodFaith: true,
        locale: 'es',
      }),
    });
    expect(email.sendNoticeReceivedEmail).toHaveBeenCalledWith(
      'ana@example.com',
      'es',
      'https://circlesfera.com/p/1',
      'ABCDEF12',
    );
  });

  it('an anonymous notice gets no email, and a failed email does not lose the notice', async () => {
    prisma.illegalContentNotice.create.mockResolvedValueOnce({
      ...stored,
      notifierEmail: null,
    });
    await service.create({
      contentUrl: stored.contentUrl,
      explanation: 'Material showing the abuse of a child.',
      childAbuse: true,
      goodFaith: true,
    });
    expect(email.sendNoticeReceivedEmail).not.toHaveBeenCalled();

    prisma.illegalContentNotice.create.mockResolvedValueOnce(stored);
    email.sendNoticeReceivedEmail.mockRejectedValueOnce(new Error('down'));
    await expect(
      service.create({
        contentUrl: stored.contentUrl,
        explanation: 'It sells counterfeit medicines to anyone.',
        notifierName: 'Ana',
        notifierEmail: 'ana@example.com',
        goodFaith: true,
      }),
    ).resolves.toEqual({ reference: 'ABCDEF12' });
  });

  it('lists child sexual abuse material first, then the oldest', async () => {
    prisma.illegalContentNotice.findMany.mockResolvedValue([]);

    await service.list('RECEIVED');
    await service.list();

    expect(prisma.illegalContentNotice.findMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'RECEIVED' },
      orderBy: [{ childAbuse: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    });
    expect(prisma.illegalContentNotice.findMany.mock.calls[1][0].where).toEqual(
      {},
    );
  });

  it('records the decision, audits it and tells the notifier with the reasons', async () => {
    prisma.illegalContentNotice.findUnique.mockResolvedValue(stored);
    prisma.illegalContentNotice.update.mockResolvedValue({
      ...stored,
      decision: 'Removed as illegal.',
    });

    await service.decide('admin-1', stored.id, {
      outcome: 'ACTIONED',
      reasons: ' Removed as illegal. ',
    });

    expect(prisma.illegalContentNotice.update).toHaveBeenCalledWith({
      where: { id: stored.id },
      data: expect.objectContaining({
        status: 'ACTIONED',
        decision: 'Removed as illegal.',
        decidedById: 'admin-1',
      }),
    });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: 'admin-1',
        targetType: 'illegal_notice',
        targetId: stored.id,
      }),
    });
    expect(email.sendNoticeDecidedEmail).toHaveBeenCalledWith(
      'ana@example.com',
      'es',
      stored.contentUrl,
      true,
      'Removed as illegal.',
    );
  });

  it('a decision with no email to send, a failed email, and an unknown notice', async () => {
    prisma.illegalContentNotice.findUnique.mockResolvedValue(stored);
    prisma.illegalContentNotice.update.mockResolvedValueOnce({
      ...stored,
      notifierEmail: null,
      decision: null,
    });
    await service.decide('admin-1', stored.id, {
      outcome: 'NO_ACTION',
      reasons: 'Not illegal: it is satire.',
    });
    expect(email.sendNoticeDecidedEmail).not.toHaveBeenCalled();

    prisma.illegalContentNotice.update.mockResolvedValueOnce({
      ...stored,
      decision: null,
    });
    email.sendNoticeDecidedEmail.mockRejectedValueOnce(new Error('down'));
    await expect(
      service.decide('admin-1', stored.id, {
        outcome: 'NO_ACTION',
        reasons: 'Not illegal: it is satire.',
      }),
    ).resolves.toBeDefined();
    expect(email.sendNoticeDecidedEmail).toHaveBeenLastCalledWith(
      'ana@example.com',
      'es',
      stored.contentUrl,
      false,
      '',
    );

    prisma.illegalContentNotice.findUnique.mockResolvedValue(null);
    await expect(
      service.decide('admin-1', 'missing', {
        outcome: 'NO_ACTION',
        reasons: 'Not illegal: it is satire.',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('with no address of its own configured, the main one counts', () => {
    const plain = new IllegalNoticesService(
      prisma as never,
      email as never,
      { get: () => undefined } as unknown as ConfigService,
    );
    expect(plain.isOwnAddress('https://circlesfera.com/p/1')).toBe(true);
  });

  describe('listPage', () => {
    const at = new Date('2026-10-18T10:00:00.000Z');
    const row = (id: string, childAbuse = false) => ({
      id,
      childAbuse,
      createdAt: at,
      decidedAt: at,
    });

    it('puts waiting notices of child abuse first, then the most recent, and gives a cursor', async () => {
      prisma.illegalContentNotice.findMany.mockResolvedValueOnce([
        row('n3', true),
        row('n2', true),
      ]);

      const page = await service.listPage('RECEIVED' as never, undefined, 1);

      expect(prisma.illegalContentNotice.findMany).toHaveBeenCalledWith({
        where: { status: 'RECEIVED' },
        orderBy: [
          { childAbuse: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: 2,
      });
      expect(page.items.map((n) => n.id)).toEqual(['n3']);

      prisma.illegalContentNotice.findMany.mockResolvedValueOnce([
        row('n2', true),
      ]);
      const next = await service.listPage(
        'RECEIVED' as never,
        page.nextCursor as string,
        1,
      );
      expect(next.nextCursor).toBeNull();
      // Past the last notice of child abuse come all the others.
      expect(prisma.illegalContentNotice.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            status: 'RECEIVED',
            OR: [
              { createdAt: { lt: at }, childAbuse: true },
              { createdAt: at, id: { lt: 'n3' }, childAbuse: true },
              { childAbuse: false },
            ],
          },
        }),
      );
    });

    it('stays among the other waiting notices once past child abuse', async () => {
      prisma.illegalContentNotice.findMany.mockResolvedValueOnce([
        row('n5'),
        row('n4'),
      ]);
      const page = await service.listPage('RECEIVED' as never, undefined, 1);
      prisma.illegalContentNotice.findMany.mockResolvedValueOnce([]);

      await service.listPage('RECEIVED' as never, page.nextCursor as string, 1);

      expect(prisma.illegalContentNotice.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            status: 'RECEIVED',
            OR: [
              { createdAt: { lt: at }, childAbuse: false },
              { createdAt: at, id: { lt: 'n5' }, childAbuse: false },
            ],
          },
        }),
      );
    });

    it('follows the decisions in a decided tab', async () => {
      prisma.illegalContentNotice.findMany.mockResolvedValueOnce([
        row('d2'),
        row('d1'),
      ]);
      const page = await service.listPage('ACTIONED' as never, undefined, 1);
      prisma.illegalContentNotice.findMany.mockResolvedValueOnce([]);

      await service.listPage('ACTIONED' as never, page.nextCursor as string);

      expect(prisma.illegalContentNotice.findMany).toHaveBeenLastCalledWith({
        where: {
          status: 'ACTIONED',
          OR: [{ decidedAt: { lt: at } }, { decidedAt: at, id: { lt: 'd2' } }],
        },
        orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
        take: 31,
      });
    });

    it.each([
      'not-base64-json',
      Buffer.from('{"c":"yes","at":"x","id":1}').toString('base64url'),
      Buffer.from('null').toString('base64url'),
    ])(
      'starts from the top with a cursor it did not give (%s)',
      async (cursor) => {
        prisma.illegalContentNotice.findMany.mockResolvedValueOnce([]);

        await service.listPage('NO_ACTION' as never, cursor, 500);

        expect(prisma.illegalContentNotice.findMany).toHaveBeenLastCalledWith(
          expect.objectContaining({ where: { status: 'NO_ACTION' }, take: 51 }),
        );
      },
    );
  });
});
