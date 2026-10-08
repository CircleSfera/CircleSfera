import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminOpsService } from './admin-ops.service.js';

// Support tickets in the staff service: handing one to moderation, keeping
// it there until its report is decided, and the read-only account card.
describe('AdminOpsService: support tickets', () => {
  const tx = {
    report: { create: vi.fn() },
    supportTicket: { update: vi.fn() },
  };
  const prisma = {
    supportTicket: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    report: { findUnique: vi.fn() },
    profile: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  const email = { sendSupportReplyEmail: vi.fn() };
  let service: AdminOpsService;

  const ticket = {
    id: 't-1',
    userId: 'u-1',
    email: 'ana@example.com',
    subject: 'Someone is harassing me',
    message: 'It keeps happening in my comments.',
    status: 'OPEN',
    escalatedReportId: null,
    resolvedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminOpsService(
      prisma as never,
      {} as never,
      email as never,
      {} as never,
      {} as never,
    );
  });

  describe('listing tickets', () => {
    const order = () => prisma.supportTicket.findMany.mock.calls[0][0].orderBy;

    it('puts the open ticket waiting longest first', async () => {
      await service.getSupportTickets(1, 20, 'OPEN');

      expect(order()).toEqual({ createdAt: 'asc' });
    });

    it('filters by what the ticket is about', async () => {
      await service.getSupportTickets(1, 20, undefined, 'PAYMENTS');
      expect(prisma.supportTicket.findMany.mock.calls[0][0].where).toEqual({
        category: 'PAYMENTS',
      });

      prisma.supportTicket.findMany.mockClear();
      await service.getSupportTickets(1, 20, 'OPEN', 'nonsense');
      expect(prisma.supportTicket.findMany.mock.calls[0][0].where).toEqual({
        status: 'OPEN',
      });
    });

    it('puts the newest first in any other list', async () => {
      await service.getSupportTickets(1, 20, 'RESOLVED');
      expect(order()).toEqual({ createdAt: 'desc' });

      prisma.supportTicket.findMany.mockClear();
      await service.getSupportTickets();
      expect(order()).toEqual({ createdAt: 'desc' });
    });
  });

  describe('handing a ticket to moderation', () => {
    it('files a report for the trust queues, linked to the ticket, and audits it', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.profile.findFirst.mockResolvedValue({ id: 'p-1' });
      tx.report.create.mockResolvedValue({ id: 'r-1', status: 'PENDING' });
      tx.supportTicket.update.mockResolvedValue({
        ...ticket,
        status: 'ESCALATED',
        escalatedReportId: 'r-1',
      });

      const result = await service.escalateSupportTicket('admin-1', 't-1');

      expect(tx.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reporterId: 'p-1',
            targetType: 'SYSTEM',
            targetId: 't-1',
            details: expect.stringContaining(ticket.subject),
          }),
        }),
      );
      expect(tx.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't-1' },
          data: { status: 'ESCALATED', escalatedReportId: 'r-1' },
        }),
      );
      expect(result.status).toBe('ESCALATED');
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          targetType: 'support_ticket',
          targetId: 't-1',
        }),
      });
    });

    it.each(['RESOLVED', 'CLOSED', 'ESCALATED'])(
      'refuses a ticket that is %s',
      async (status) => {
        prisma.supportTicket.findUnique.mockResolvedValue({
          ...ticket,
          status,
        });

        await expect(
          service.escalateSupportTicket('admin-1', 't-1'),
        ).rejects.toMatchObject({ status: 409 });
        expect(tx.report.create).not.toHaveBeenCalled();
      },
    );

    it('refuses a ticket whose account no longer exists', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({
        ...ticket,
        userId: null,
      });

      await expect(
        service.escalateSupportTicket('admin-1', 't-1'),
      ).rejects.toMatchObject({ status: 409 });
      expect(tx.report.create).not.toHaveBeenCalled();
    });

    it('says so when the ticket does not exist', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(null);

      await expect(
        service.escalateSupportTicket('admin-1', 'missing'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('a ticket that is with moderation', () => {
    const escalated = {
      ...ticket,
      status: 'ESCALATED',
      escalatedReportId: 'r-1',
    };

    it.each(['PENDING', 'REVIEWING'])(
      'cannot be answered or closed while its report is %s',
      async (reportStatus) => {
        prisma.supportTicket.findUnique.mockResolvedValue(escalated);
        prisma.report.findUnique.mockResolvedValue({ status: reportStatus });

        await expect(
          service.updateSupportTicket('admin-1', 't-1', { status: 'CLOSED' }),
        ).rejects.toMatchObject({ status: 409 });
        expect(prisma.supportTicket.update).not.toHaveBeenCalled();
        expect(email.sendSupportReplyEmail).not.toHaveBeenCalled();
      },
    );

    it.each(['RESOLVED', 'REJECTED'])(
      'goes back to support once its report is %s',
      async (reportStatus) => {
        prisma.supportTicket.findUnique.mockResolvedValue(escalated);
        prisma.report.findUnique.mockResolvedValue({ status: reportStatus });
        prisma.supportTicket.update.mockResolvedValue({
          ...escalated,
          status: 'RESOLVED',
        });

        await service.updateSupportTicket('admin-1', 't-1', {
          status: 'RESOLVED',
          reply: 'Moderation has acted on it.',
        });

        expect(prisma.supportTicket.update).toHaveBeenCalled();
        expect(email.sendSupportReplyEmail).toHaveBeenCalled();
      },
    );
  });

  describe('the account card', () => {
    it('shows plan, payout account and the standing of each Profile, and writes nothing', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ userId: 'u-1' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u-1',
        isActive: true,
        createdAt: new Date('2026-01-01'),
        identityVerifiedAt: new Date('2026-02-01'),
        stripeConnectAccountId: 'acct_1',
        monetization: { transfersEnabled: true },
        profiles: [
          {
            id: 'p-1',
            username: 'ana',
            accountType: 'CREATOR',
            verificationLevel: 'ELITE',
            isAccountBanned: false,
            suspendedUntil: new Date(Date.now() + 86_400_000),
          },
        ],
        platformSubscriptions: [
          {
            currentPeriodEnd: new Date('2026-11-01'),
            cancelAtPeriodEnd: false,
            plan: { name: 'Elite Creator' },
          },
        ],
      });

      const card = await service.getSupportTicketAccount('t-1');

      expect(card).toMatchObject({
        userId: 'u-1',
        identityVerified: true,
        plan: { name: 'Elite Creator', cancelAtPeriodEnd: false },
        payouts: { connected: true, enabled: true },
        profiles: [{ username: 'ana', banned: false, suspended: true }],
      });
      // The card never carries the email, the payout account id or dates of
      // the identity check.
      expect(JSON.stringify(card)).not.toContain('acct_1');
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    });

    it('is empty for a ticket whose account no longer exists', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ userId: null });

      expect(await service.getSupportTicketAccount('t-1')).toBeNull();
    });
  });
});
