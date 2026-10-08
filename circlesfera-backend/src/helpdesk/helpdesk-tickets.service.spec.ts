import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

// Tickets of the Help Desk. The host is replaced by its contracts: what is
// proven here is what the Help Desk asks of them and what it does itself.
describe('HelpdeskTicketsService', () => {
  const prisma = {
    supportTicket: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
  const requesters = { describe: vi.fn() };
  const accountCards = { accountCard: vi.fn() };
  const handover = { open: vi.fn(), withdraw: vi.fn(), cases: vi.fn() };
  const notifier = { answer: vi.fn() };
  const teamChannel = { ticketOpened: vi.fn() };
  const staffLog = { record: vi.fn() };
  let service: HelpdeskTicketsService;

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
  const caseOf = (status: string) =>
    new Map([
      [
        'r-1',
        {
          id: 'r-1',
          status,
          pending: ['PENDING', 'REVIEWING'].includes(status),
        },
      ],
    ]);

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.supportTicket.findMany.mockResolvedValue([]);
    prisma.supportTicket.count.mockResolvedValue(0);
    requesters.describe.mockResolvedValue(new Map());
    handover.cases.mockResolvedValue(new Map());
    service = new HelpdeskTicketsService(
      prisma as never,
      requesters,
      accountCards,
      handover,
      notifier,
      teamChannel,
      staffLog,
    );
  });

  describe('opening a ticket', () => {
    const dto = {
      email: 'user@example.com',
      subject: 'Payment Issue',
      message: 'I cannot unlock post',
      userId: 'user-1',
    };

    it('stores the ticket and tells the team', async () => {
      const created = { id: 'ticket-1', ...dto };
      prisma.supportTicket.create.mockResolvedValue(created);

      const result = await service.createTicket(dto);

      expect(prisma.supportTicket.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          subject: dto.subject,
          message: dto.message,
          category: undefined,
          userId: dto.userId,
        },
      });
      expect(teamChannel.ticketOpened).toHaveBeenCalledWith(created);
      expect(result).toEqual({
        success: true,
        message: 'Support ticket created successfully',
        ticketId: 'ticket-1',
      });
    });

    it('stores the topic the requester chose', async () => {
      prisma.supportTicket.create.mockResolvedValue({ id: 't-2' });

      await service.createTicket({ ...dto, category: 'PAYMENTS' });

      expect(prisma.supportTicket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ category: 'PAYMENTS' }),
      });
    });
  });

  describe('listing tickets', () => {
    const query = () => prisma.supportTicket.findMany.mock.calls[0][0];

    it('puts the open ticket waiting longest first', async () => {
      await service.listTickets(1, 20, 'OPEN');

      expect(query().orderBy).toEqual({ createdAt: 'asc' });
    });

    it('puts the newest first in any other list', async () => {
      await service.listTickets(1, 20, 'RESOLVED');
      expect(query().orderBy).toEqual({ createdAt: 'desc' });

      prisma.supportTicket.findMany.mockClear();
      await service.listTickets();
      expect(query().orderBy).toEqual({ createdAt: 'desc' });
    });

    it('filters by what the ticket is about', async () => {
      await service.listTickets(1, 20, undefined, 'PAYMENTS');
      expect(query().where).toEqual({ category: 'PAYMENTS' });

      prisma.supportTicket.findMany.mockClear();
      await service.listTickets(1, 20, 'OPEN', 'nonsense');
      expect(query().where).toEqual({ status: 'OPEN' });
    });

    it('reads tickets alone and asks the host who wrote them and where each handed case stands', async () => {
      prisma.supportTicket.findMany.mockResolvedValue([
        ticket,
        { ...ticket, id: 't-2', status: 'ESCALATED', escalatedReportId: 'r-1' },
        { ...ticket, id: 't-3', userId: null },
      ]);
      prisma.supportTicket.count.mockResolvedValue(3);
      const ana = {
        id: 'u-1',
        email: 'ana@example.com',
        profile: { username: 'ana', avatar: null },
      };
      requesters.describe.mockResolvedValue(new Map([['u-1', ana]]));
      handover.cases.mockResolvedValue(caseOf('PENDING'));

      const result = await service.listTickets();

      // No relation to the host's tables is read from the Help Desk.
      expect(query()).not.toHaveProperty('include');
      expect(requesters.describe).toHaveBeenCalledWith(['u-1']);
      expect(handover.cases).toHaveBeenCalledWith(['r-1']);
      expect(result.data.map((t) => t.user)).toEqual([ana, ana, null]);
      expect(result.data.map((t) => t.escalatedReport)).toEqual([
        null,
        { id: 'r-1', status: 'PENDING' },
        null,
      ]);
      expect(result.meta).toEqual({
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });
  });

  describe('handing a ticket to another team', () => {
    it('opens a case for the ticket, links it and records who did it', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      handover.open.mockResolvedValue({ caseRef: 'r-1' });
      handover.cases.mockResolvedValue(caseOf('PENDING'));
      prisma.supportTicket.update.mockResolvedValue({
        ...ticket,
        status: 'ESCALATED',
        escalatedReportId: 'r-1',
      });

      const result = await service.handOver('admin-1', 't-1');

      expect(handover.open).toHaveBeenCalledWith({
        id: 't-1',
        requesterRef: 'u-1',
        subject: ticket.subject,
        message: ticket.message,
      });
      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { status: 'ESCALATED', escalatedReportId: 'r-1' },
      });
      expect(result.status).toBe('ESCALATED');
      expect(result.escalatedReport).toEqual({ id: 'r-1', status: 'PENDING' });
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        't-1',
        expect.stringContaining('r-1'),
      );
    });

    it('takes the case back when the ticket could not be linked to it', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      handover.open.mockResolvedValue({ caseRef: 'r-1' });
      prisma.supportTicket.update.mockRejectedValue(new Error('db down'));

      await expect(service.handOver('admin-1', 't-1')).rejects.toThrow(
        'db down',
      );
      expect(handover.withdraw).toHaveBeenCalledWith('r-1');
      expect(staffLog.record).not.toHaveBeenCalled();
    });

    it.each(['RESOLVED', 'CLOSED', 'ESCALATED'])(
      'refuses a ticket that is %s',
      async (status) => {
        prisma.supportTicket.findUnique.mockResolvedValue({
          ...ticket,
          status,
        });

        await expect(service.handOver('admin-1', 't-1')).rejects.toMatchObject({
          status: 409,
        });
        expect(handover.open).not.toHaveBeenCalled();
      },
    );

    it('refuses a ticket whose requester no longer exists for the host', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      handover.open.mockResolvedValue(null);

      await expect(service.handOver('admin-1', 't-1')).rejects.toMatchObject({
        status: 409,
      });
      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
    });

    it('says so when the ticket does not exist', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(null);

      await expect(
        service.handOver('admin-1', 'missing'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('a ticket that is with another team', () => {
    const escalated = {
      ...ticket,
      status: 'ESCALATED',
      escalatedReportId: 'r-1',
    };

    it.each(['PENDING', 'REVIEWING'])(
      'cannot be answered or closed while its case is %s',
      async (status) => {
        prisma.supportTicket.findUnique.mockResolvedValue(escalated);
        handover.cases.mockResolvedValue(caseOf(status));

        await expect(
          service.updateTicket('admin-1', 't-1', { status: 'CLOSED' }),
        ).rejects.toMatchObject({ status: 409 });
        expect(prisma.supportTicket.update).not.toHaveBeenCalled();
        expect(notifier.answer).not.toHaveBeenCalled();
      },
    );

    it.each(['RESOLVED', 'REJECTED'])(
      'goes back to support once its case is %s',
      async (status) => {
        prisma.supportTicket.findUnique.mockResolvedValue(escalated);
        handover.cases.mockResolvedValue(caseOf(status));
        prisma.supportTicket.update.mockResolvedValue({
          ...escalated,
          status: 'RESOLVED',
        });

        await service.updateTicket('admin-1', 't-1', {
          status: 'RESOLVED',
          reply: 'Moderation has acted on it.',
        });

        expect(prisma.supportTicket.update).toHaveBeenCalled();
        expect(notifier.answer).toHaveBeenCalled();
      },
    );
  });

  describe('answering a ticket', () => {
    it('stores the reply, solves an open ticket, tells the requester and records it', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.supportTicket.update.mockResolvedValue({
        ...ticket,
        status: 'RESOLVED',
        reply: 'Fixed.',
      });

      await service.updateTicket('admin-1', 't-1', { reply: '  Fixed.  ' });

      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: expect.objectContaining({
          reply: '  Fixed.  ',
          status: 'RESOLVED',
          resolvedAt: expect.any(Date),
        }),
      });
      expect(notifier.answer).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ana@example.com',
          subject: ticket.subject,
        }),
        'Fixed.',
      );
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        't-1',
        expect.stringContaining('(replied)'),
      );
    });

    it('changes the state without telling the requester when there is no reply', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.supportTicket.update.mockResolvedValue({
        ...ticket,
        status: 'CLOSED',
      });

      await service.updateTicket('admin-1', 't-1', { status: 'CLOSED' });

      expect(notifier.answer).not.toHaveBeenCalled();
      expect(staffLog.record).toHaveBeenCalled();
    });

    it('says so when the ticket does not exist', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTicket('admin-1', 'missing', { status: 'CLOSED' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('the account card', () => {
    it('is whatever the host says about who wrote the ticket, and writes nothing', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ userId: 'u-1' });
      accountCards.accountCard.mockResolvedValue({ userId: 'u-1' });

      expect(await service.accountCard('t-1')).toEqual({ userId: 'u-1' });
      expect(accountCards.accountCard).toHaveBeenCalledWith('u-1');
      expect(prisma.supportTicket.update).not.toHaveBeenCalled();
      expect(staffLog.record).not.toHaveBeenCalled();
    });

    it('is empty for a ticket whose account no longer exists', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({ userId: null });

      expect(await service.accountCard('t-1')).toBeNull();
      expect(accountCards.accountCard).not.toHaveBeenCalled();
    });

    it('says so when the ticket does not exist', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(null);

      await expect(service.accountCard('missing')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
