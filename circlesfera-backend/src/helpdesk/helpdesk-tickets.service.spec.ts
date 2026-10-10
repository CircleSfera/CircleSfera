import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

// Tickets of the Help Desk. The database is behind the store and the host
// behind its contracts: what is proven here is what the service asks of
// them and the rules it applies itself.
describe('HelpdeskTicketsService', () => {
  const store = {
    openTicket: vi.fn(),
    findTicket: vi.fn(),
    findRequesterTicket: vi.fn(),
    listRequesterTickets: vi.fn(),
    ticketsWithOtherTeam: vi.fn(),
    ticketsSolvedBefore: vi.fn(),
    listTickets: vi.fn(),
    updateTicket: vi.fn(),
    messages: vi.fn(),
  };
  const requesters = { describe: vi.fn() };
  const accountCards = { accountCard: vi.fn() };
  const handover = { open: vi.fn(), withdraw: vi.fn(), cases: vi.fn() };
  const notifier = { answer: vi.fn() };
  const teamChannel = { ticketOpened: vi.fn(), requesterReplied: vi.fn() };
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
    category: 'OTHER',
    priority: 'NORMAL',
    assignedAgentRef: null,
  };
  const stateEvent = (
    fromValue: string,
    toValue: string,
    actorKind: 'REQUESTER' | 'AGENT' | 'SYSTEM',
    actorRef: string | null,
  ) => ({ kind: 'STATE', fromValue, toValue, actorKind, actorRef });
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
  const ana = {
    id: 'u-1',
    email: 'ana@example.com',
    profile: { username: 'ana', avatar: null },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    store.listTickets.mockResolvedValue({ tickets: [], total: 0 });
    store.listRequesterTickets.mockResolvedValue({ tickets: [], total: 0 });
    store.messages.mockResolvedValue([]);
    requesters.describe.mockResolvedValue(new Map());
    handover.cases.mockResolvedValue(new Map());
    teamChannel.requesterReplied.mockResolvedValue(undefined);
    service = new HelpdeskTicketsService(
      store as never,
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
      store.openTicket.mockResolvedValue(created);

      const result = await service.createTicket(dto);

      expect(store.openTicket).toHaveBeenCalledWith({
        requesterRef: 'user-1',
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        category: undefined,
      });
      expect(teamChannel.ticketOpened).toHaveBeenCalledWith(created);
      expect(result).toEqual({
        success: true,
        message: 'Support ticket created successfully',
        ticketId: 'ticket-1',
      });
    });

    it('stores the topic the requester chose', async () => {
      store.openTicket.mockResolvedValue({ id: 't-2' });

      await service.createTicket({ ...dto, category: 'PAYMENTS' });

      expect(store.openTicket).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'PAYMENTS' }),
      );
    });
  });

  describe('listing tickets', () => {
    it('puts the open ticket waiting longest first, and the newest first in any other list', async () => {
      await service.listTickets(1, 20, 'OPEN');
      expect(store.listTickets).toHaveBeenLastCalledWith(
        { status: 'OPEN' },
        1,
        20,
        true,
      );

      await service.listTickets(1, 20, 'RESOLVED');
      expect(store.listTickets).toHaveBeenLastCalledWith(
        { status: 'RESOLVED' },
        1,
        20,
        false,
      );

      await service.listTickets();
      expect(store.listTickets).toHaveBeenLastCalledWith({}, 1, 20, false);
    });

    it('filters by what the ticket is about and ignores values that do not exist', async () => {
      await service.listTickets(1, 20, undefined, 'PAYMENTS');
      expect(store.listTickets).toHaveBeenLastCalledWith(
        { category: 'PAYMENTS' },
        1,
        20,
        false,
      );

      await service.listTickets(1, 20, 'nonsense', 'nonsense');
      expect(store.listTickets).toHaveBeenLastCalledWith({}, 1, 20, false);
    });

    it('filters by the waiting state too', async () => {
      await service.listTickets(1, 20, 'WAITING');

      expect(store.listTickets).toHaveBeenLastCalledWith(
        { status: 'WAITING' },
        1,
        20,
        false,
      );
    });

    it('lists the tickets of the agent, the ones nobody has, or all', async () => {
      const team = { agentRef: 'admin-1' };

      await service.listTickets(1, 20, undefined, undefined, {
        ...team,
        assignment: 'mine',
      });
      expect(store.listTickets.mock.calls.at(-1)?.[0]).toEqual({
        assignedAgentRef: 'admin-1',
      });

      await service.listTickets(1, 20, undefined, undefined, {
        ...team,
        assignment: 'unassigned',
      });
      expect(store.listTickets.mock.calls.at(-1)?.[0]).toEqual({
        assignedAgentRef: null,
      });

      await service.listTickets(1, 20, undefined, undefined, team);
      expect(store.listTickets.mock.calls.at(-1)?.[0]).toEqual({});
    });

    it('filters by priority and ignores one that does not exist', async () => {
      await service.listTickets(1, 20, undefined, undefined, {
        priority: 'HIGH',
      });
      expect(store.listTickets.mock.calls.at(-1)?.[0]).toEqual({
        priority: 'HIGH',
      });

      await service.listTickets(1, 20, undefined, undefined, {
        priority: 'URGENT',
      });
      expect(store.listTickets.mock.calls.at(-1)?.[0]).toEqual({});
    });

    it('asks the host who wrote the tickets and where each handed case stands', async () => {
      store.listTickets.mockResolvedValue({
        tickets: [
          ticket,
          {
            ...ticket,
            id: 't-2',
            status: 'ESCALATED',
            escalatedReportId: 'r-1',
          },
          { ...ticket, id: 't-3', userId: null },
        ],
        total: 3,
      });
      requesters.describe.mockResolvedValue(new Map([['u-1', ana]]));
      handover.cases.mockResolvedValue(caseOf('PENDING'));

      const result = await service.listTickets();

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

  describe('reading one ticket', () => {
    it('gives the agent the whole conversation, internal notes included', async () => {
      const messages = [
        { id: 'm-1', authorKind: 'REQUESTER', visibility: 'PUBLIC' },
        { id: 'm-2', authorKind: 'AGENT', visibility: 'INTERNAL' },
      ];
      store.findTicket.mockResolvedValue(ticket);
      store.messages.mockResolvedValue(messages);
      requesters.describe.mockResolvedValue(new Map([['u-1', ana]]));

      const result = await service.getTicket('t-1');

      // No visibility filter: this is the agent's view.
      expect(store.messages).toHaveBeenCalledWith('t-1');
      expect(result.messages).toEqual(messages);
      expect(result.user).toEqual(ana);
      expect(result.escalatedReport).toBeNull();
    });

    it('says so when the ticket does not exist', async () => {
      store.findTicket.mockResolvedValue(null);

      await expect(service.getTicket('missing')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('adding to the conversation', () => {
    const answer = { body: '  Fixed.  ', visibility: 'PUBLIC' as const };
    const note = {
      body: 'Checked the payment.',
      visibility: 'INTERNAL' as const,
    };

    it('sends an answer: the message, the ticket solved, the requester told, the action recorded', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue({
        ...ticket,
        reference: 42,
        status: 'RESOLVED',
      });

      await service.addMessage('admin-1', 't-1', answer);

      expect(store.updateTicket).toHaveBeenCalledWith(
        't-1',
        {
          status: 'RESOLVED',
          resolvedAt: expect.any(Date),
          waitingRemindedAt: null,
          // Nobody had it: it is now of who answered.
          assignedAgentRef: 'admin-1',
        },
        {
          authorKind: 'AGENT',
          authorRef: 'admin-1',
          visibility: 'PUBLIC',
          body: 'Fixed.',
        },
        [
          stateEvent('OPEN', 'RESOLVED', 'AGENT', 'admin-1'),
          {
            kind: 'ASSIGNMENT',
            fromValue: null,
            toValue: 'admin-1',
            actorKind: 'AGENT',
            actorRef: 'admin-1',
          },
        ],
      );
      // What the notice needs, and nothing else of the ticket.
      expect(notifier.answer).toHaveBeenCalledWith(
        {
          id: 't-1',
          reference: 42,
          subject: ticket.subject,
          email: 'ana@example.com',
          requesterRef: 'u-1',
        },
        'Fixed.',
      );
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        't-1',
        expect.stringContaining('RESOLVED'),
      );
    });

    it('leaves the ticket open when the agent asks for it', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue(ticket);

      await service.addMessage('admin-1', 't-1', { ...answer, status: 'OPEN' });

      expect(store.updateTicket.mock.calls[0][1]).toMatchObject({
        status: 'OPEN',
        resolvedAt: null,
      });
      // The state did not change, so no event says it did.
      expect(
        store.updateTicket.mock.calls[0][3].map(
          (e: { kind: string }) => e.kind,
        ),
      ).toEqual(['ASSIGNMENT']);
    });

    it('leaves the ticket waiting for the requester, with no reminder sent yet', async () => {
      store.findTicket.mockResolvedValue({
        ...ticket,
        assignedAgentRef: 'admin-1',
      });
      store.updateTicket.mockResolvedValue(ticket);

      await service.addMessage('admin-1', 't-1', {
        ...answer,
        status: 'WAITING',
      });

      expect(store.updateTicket.mock.calls[0][1]).toEqual({
        status: 'WAITING',
        waitingRemindedAt: null,
      });
      expect(store.updateTicket.mock.calls[0][3]).toEqual([
        stateEvent('OPEN', 'WAITING', 'AGENT', 'admin-1'),
      ]);
    });

    it('does not take a ticket that someone else already has', async () => {
      store.findTicket.mockResolvedValue({
        ...ticket,
        assignedAgentRef: 'admin-2',
      });
      store.updateTicket.mockResolvedValue(ticket);

      await service.addMessage('admin-1', 't-1', answer);

      expect(store.updateTicket.mock.calls[0][1]).not.toHaveProperty(
        'assignedAgentRef',
      );
    });

    it('reopens a solved ticket that is answered and left open', async () => {
      store.findTicket.mockResolvedValue({
        ...ticket,
        status: 'RESOLVED',
        resolvedAt: new Date('2026-01-01'),
      });
      store.updateTicket.mockResolvedValue(ticket);

      await service.addMessage('admin-1', 't-1', { ...answer, status: 'OPEN' });

      expect(store.updateTicket.mock.calls[0][1]).toMatchObject({
        status: 'OPEN',
        resolvedAt: null,
      });
      expect(store.updateTicket.mock.calls[0][3]).toContainEqual(
        stateEvent('RESOLVED', 'OPEN', 'AGENT', 'admin-1'),
      );
    });

    it('adds an internal note: no email, no change of state', async () => {
      store.findTicket.mockResolvedValue(ticket);

      await service.addMessage('admin-1', 't-1', {
        ...note,
        // A state sent with a note is ignored.
        status: 'RESOLVED',
      });

      expect(store.updateTicket).toHaveBeenCalledWith(
        't-1',
        {},
        {
          authorKind: 'AGENT',
          authorRef: 'admin-1',
          visibility: 'INTERNAL',
          body: 'Checked the payment.',
        },
      );
      expect(notifier.answer).not.toHaveBeenCalled();
    });

    it('accepts a note on a closed ticket and on one that is with another team', async () => {
      store.findTicket.mockResolvedValue({ ...ticket, status: 'CLOSED' });
      await service.addMessage('admin-1', 't-1', note);

      store.findTicket.mockResolvedValue({
        ...ticket,
        status: 'ESCALATED',
        escalatedReportId: 'r-1',
      });
      handover.cases.mockResolvedValue(caseOf('PENDING'));
      await service.addMessage('admin-1', 't-1', note);

      expect(store.updateTicket).toHaveBeenCalledTimes(2);
      expect(notifier.answer).not.toHaveBeenCalled();
    });

    it('refuses an answer to a closed ticket', async () => {
      store.findTicket.mockResolvedValue({ ...ticket, status: 'CLOSED' });

      await expect(
        service.addMessage('admin-1', 't-1', answer),
      ).rejects.toMatchObject({ status: 409 });
      expect(store.updateTicket).not.toHaveBeenCalled();
      expect(notifier.answer).not.toHaveBeenCalled();
    });

    it.each(['PENDING', 'REVIEWING'])(
      'refuses an answer while the ticket is with another team and its case is %s',
      async (status) => {
        store.findTicket.mockResolvedValue({
          ...ticket,
          status: 'ESCALATED',
          escalatedReportId: 'r-1',
        });
        handover.cases.mockResolvedValue(caseOf(status));

        await expect(
          service.addMessage('admin-1', 't-1', answer),
        ).rejects.toMatchObject({ status: 409 });
        expect(store.updateTicket).not.toHaveBeenCalled();
      },
    );

    it('refuses a message that is only spaces', async () => {
      await expect(
        service.addMessage('admin-1', 't-1', { ...answer, body: '   ' }),
      ).rejects.toMatchObject({ status: 400 });
      expect(store.findTicket).not.toHaveBeenCalled();
    });

    it('says so when the ticket does not exist', async () => {
      store.findTicket.mockResolvedValue(null);

      await expect(
        service.addMessage('admin-1', 'missing', answer),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('the requester and their own tickets', () => {
    const stored = {
      ...ticket,
      reference: 42,
      category: 'PAYMENTS',
      organizationId: 'org-1',
      escalatedReportId: 'r-1',
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-02'),
    };
    const shown = {
      id: 't-1',
      reference: 42,
      subject: ticket.subject,
      category: 'PAYMENTS',
      status: 'OPEN',
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      previousTicketId: null,
    };

    it('lists what they opened, without anything internal', async () => {
      store.listRequesterTickets.mockResolvedValue({
        tickets: [stored],
        total: 1,
      });

      const result = await service.listMyTickets('u-1');

      expect(store.listRequesterTickets).toHaveBeenCalledWith('u-1', 1, 20);
      // No organization, no case with another team, no email, no old fields.
      expect(result.data).toEqual([shown]);
      expect(result.meta.total).toBe(1);
    });

    it('shows a ticket with its public messages only, and not who of the team wrote', async () => {
      store.findRequesterTicket.mockResolvedValue(stored);
      store.messages.mockResolvedValue([
        {
          id: 'm-1',
          authorKind: 'AGENT',
          authorRef: 'admin-1',
          visibility: 'PUBLIC',
          body: 'We are on it.',
          channel: 'PRODUCT',
          createdAt: new Date('2026-09-02'),
        },
      ]);

      const result = await service.getMyTicket('u-1', 't-1');

      expect(store.findRequesterTicket).toHaveBeenCalledWith('t-1', 'u-1');
      // Internal notes are left out by the query, not by this code.
      expect(store.messages).toHaveBeenCalledWith('t-1', 'PUBLIC');
      expect(result).toEqual({
        ...shown,
        messages: [
          {
            id: 'm-1',
            authorKind: 'AGENT',
            body: 'We are on it.',
            createdAt: new Date('2026-09-02'),
          },
        ],
      });
    });

    it('treats a ticket of someone else as one that does not exist', async () => {
      store.findRequesterTicket.mockResolvedValue(null);

      await expect(service.getMyTicket('u-2', 't-1')).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        service.replyToMyTicket('u-2', 't-1', { body: 'Hello' }),
      ).rejects.toMatchObject({ status: 404 });
      expect(store.messages).not.toHaveBeenCalled();
      expect(store.updateTicket).not.toHaveBeenCalled();
    });

    it('adds their reply to an open ticket without touching its state', async () => {
      store.findRequesterTicket.mockResolvedValue(stored);

      await service.replyToMyTicket('u-1', 't-1', { body: '  On the 2nd.  ' });

      expect(store.updateTicket).toHaveBeenCalledWith(
        't-1',
        {},
        {
          authorKind: 'REQUESTER',
          authorRef: 'u-1',
          visibility: 'PUBLIC',
          body: 'On the 2nd.',
        },
        [],
      );
    });

    it('opens a solved ticket again when they reply', async () => {
      store.findRequesterTicket.mockResolvedValue({
        ...stored,
        status: 'RESOLVED',
        resolvedAt: new Date('2026-09-03'),
      });

      await service.replyToMyTicket('u-1', 't-1', { body: 'Still happening' });

      expect(store.updateTicket.mock.calls[0][1]).toEqual({
        status: 'OPEN',
        resolvedAt: null,
        waitingRemindedAt: null,
      });
      expect(store.updateTicket.mock.calls[0][3]).toEqual([
        stateEvent('RESOLVED', 'OPEN', 'REQUESTER', 'u-1'),
      ]);
    });

    it('ends the wait when they reply to a ticket that waits for them', async () => {
      store.findRequesterTicket.mockResolvedValue({
        ...stored,
        status: 'WAITING',
      });

      await service.replyToMyTicket('u-1', 't-1', { body: 'Here it is' });

      expect(store.updateTicket.mock.calls[0][1]).toMatchObject({
        status: 'OPEN',
      });
      expect(store.updateTicket.mock.calls[0][3]).toEqual([
        stateEvent('WAITING', 'OPEN', 'REQUESTER', 'u-1'),
      ]);
    });

    it('keeps a ticket that is with another team where it is', async () => {
      store.findRequesterTicket.mockResolvedValue({
        ...stored,
        status: 'ESCALATED',
      });

      await service.replyToMyTicket('u-1', 't-1', { body: 'More detail' });

      expect(store.updateTicket.mock.calls[0][1]).toEqual({});
    });

    it('opens a new request that continues a closed one, and leaves the closed one as it is', async () => {
      const continued = {
        ...stored,
        id: 't-2',
        reference: 43,
        subject: `Re: ${ticket.subject}`,
        previousTicketId: 't-1',
      };
      store.findRequesterTicket
        .mockResolvedValueOnce({ ...stored, status: 'CLOSED' })
        .mockResolvedValueOnce(continued);
      store.openTicket.mockResolvedValue(continued);

      const result = await service.replyToMyTicket('u-1', 't-1', {
        body: '  It happened again.  ',
      });

      expect(store.openTicket).toHaveBeenCalledWith({
        requesterRef: 'u-1',
        email: 'ana@example.com',
        subject: `Re: ${ticket.subject}`,
        message: 'It happened again.',
        category: 'PAYMENTS',
        previousTicketId: 't-1',
      });
      expect(store.updateTicket).not.toHaveBeenCalled();
      expect(teamChannel.ticketOpened).toHaveBeenCalledWith(continued);
      expect(result.id).toBe('t-2');
      expect(result.previousTicketId).toBe('t-1');
    });

    it('does not pile up "Re:" and keeps the subject within its length', async () => {
      store.openTicket.mockResolvedValue({ ...stored, id: 't-2' });
      store.findRequesterTicket.mockResolvedValue({
        ...stored,
        status: 'CLOSED',
        subject: 'Re: Help',
      });
      await service.replyToMyTicket('u-1', 't-1', { body: 'Again' });
      expect(store.openTicket.mock.calls[0][0].subject).toBe('Re: Help');

      store.findRequesterTicket.mockResolvedValue({
        ...stored,
        status: 'CLOSED',
        subject: 'x'.repeat(100),
      });
      await service.replyToMyTicket('u-1', 't-1', { body: 'Again' });
      expect(store.openTicket.mock.calls[1][0].subject).toHaveLength(100);
    });

    it('refuses a reply that is only spaces', async () => {
      await expect(
        service.replyToMyTicket('u-1', 't-1', { body: '   ' }),
      ).rejects.toMatchObject({ status: 400 });
      expect(store.findRequesterTicket).not.toHaveBeenCalled();
    });

    it('tells the team about their reply, and not the requester or the staff log', async () => {
      store.findRequesterTicket.mockResolvedValue(stored);

      await service.replyToMyTicket('u-1', 't-1', { body: 'Hello' });

      expect(teamChannel.requesterReplied).toHaveBeenCalledWith({
        id: 't-1',
        reference: 42,
        subject: ticket.subject,
        email: 'ana@example.com',
        requesterRef: 'u-1',
      });
      expect(notifier.answer).not.toHaveBeenCalled();
      expect(staffLog.record).not.toHaveBeenCalled();
    });

    it('keeps the reply when the team could not be told', async () => {
      store.findRequesterTicket.mockResolvedValue(stored);
      teamChannel.requesterReplied.mockRejectedValue(new Error('channel down'));

      await expect(
        service.replyToMyTicket('u-1', 't-1', { body: 'Hello' }),
      ).resolves.toBeDefined();
      expect(store.updateTicket).toHaveBeenCalledTimes(1);
    });
  });

  describe('handing a ticket to another team', () => {
    it('opens a case for the ticket, links it and records who did it', async () => {
      store.findTicket.mockResolvedValue(ticket);
      handover.open.mockResolvedValue({ caseRef: 'r-1' });
      handover.cases.mockResolvedValue(caseOf('PENDING'));
      store.updateTicket.mockResolvedValue({
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
      expect(store.updateTicket).toHaveBeenCalledWith(
        't-1',
        { status: 'ESCALATED', escalatedReportId: 'r-1' },
        undefined,
        [
          stateEvent('OPEN', 'ESCALATED', 'AGENT', 'admin-1'),
          {
            kind: 'HANDOVER',
            fromValue: null,
            toValue: 'r-1',
            actorKind: 'AGENT',
            actorRef: 'admin-1',
          },
        ],
      );
      expect(result.status).toBe('ESCALATED');
      expect(result.escalatedReport).toEqual({ id: 'r-1', status: 'PENDING' });
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        't-1',
        expect.stringContaining('r-1'),
      );
    });

    it('takes the case back when the ticket could not be linked to it', async () => {
      store.findTicket.mockResolvedValue(ticket);
      handover.open.mockResolvedValue({ caseRef: 'r-1' });
      store.updateTicket.mockRejectedValue(new Error('db down'));

      await expect(service.handOver('admin-1', 't-1')).rejects.toThrow(
        'db down',
      );
      expect(handover.withdraw).toHaveBeenCalledWith('r-1');
      expect(staffLog.record).not.toHaveBeenCalled();
    });

    it.each(['RESOLVED', 'CLOSED', 'ESCALATED'])(
      'refuses a ticket that is %s',
      async (status) => {
        store.findTicket.mockResolvedValue({ ...ticket, status });

        await expect(service.handOver('admin-1', 't-1')).rejects.toMatchObject({
          status: 409,
        });
        expect(handover.open).not.toHaveBeenCalled();
      },
    );

    it('refuses a ticket whose requester no longer exists for the host', async () => {
      store.findTicket.mockResolvedValue(ticket);
      handover.open.mockResolvedValue(null);

      await expect(service.handOver('admin-1', 't-1')).rejects.toMatchObject({
        status: 409,
      });
      expect(store.updateTicket).not.toHaveBeenCalled();
    });

    it('says so when the ticket does not exist', async () => {
      store.findTicket.mockResolvedValue(null);

      await expect(
        service.handOver('admin-1', 'missing'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('closing solved tickets', () => {
    it('closes the ones solved more than seven days ago, each with its event', async () => {
      store.ticketsSolvedBefore.mockResolvedValue([
        { id: 't-1', status: 'RESOLVED' },
        { id: 't-2', status: 'RESOLVED' },
      ]);
      const before = Date.now();

      expect(await service.closeSolvedTickets()).toBe(2);

      const moment = store.ticketsSolvedBefore.mock.calls[0][0] as Date;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(before - moment.getTime()).toBeGreaterThanOrEqual(sevenDays);
      expect(before - moment.getTime()).toBeLessThan(sevenDays + 5_000);
      expect(store.updateTicket).toHaveBeenCalledTimes(2);
      expect(store.updateTicket).toHaveBeenCalledWith(
        't-2',
        { status: 'CLOSED' },
        undefined,
        [stateEvent('RESOLVED', 'CLOSED', 'SYSTEM', null)],
      );
    });
  });

  describe('tickets coming back from another team', () => {
    const held = (id: string, caseRef: string | null) => ({
      id,
      escalatedReportId: caseRef,
    });
    const cases = (entries: [string, string][]) =>
      new Map(
        entries.map(([ref, status]) => [
          ref,
          {
            id: ref,
            status,
            pending: ['PENDING', 'REVIEWING'].includes(status),
          },
        ]),
      );

    it('reopens the decided ones with a note for agents, and leaves the pending ones', async () => {
      store.ticketsWithOtherTeam.mockResolvedValue([
        held('t-1', 'r-1'),
        held('t-2', 'r-2'),
        held('t-3', 'r-3'),
      ]);
      handover.cases.mockResolvedValue(
        cases([
          ['r-1', 'RESOLVED'],
          ['r-2', 'PENDING'],
          ['r-3', 'REVIEWING'],
        ]),
      );

      expect(await service.returnDecidedHandovers()).toBe(1);

      expect(store.updateTicket).toHaveBeenCalledTimes(1);
      expect(store.updateTicket).toHaveBeenCalledWith(
        't-1',
        { status: 'OPEN', resolvedAt: null },
        {
          authorKind: 'SYSTEM',
          authorRef: null,
          // Agents only: the requester is not told how moderation decided.
          visibility: 'INTERNAL',
          body: 'handover.decided:RESOLVED',
        },
        [stateEvent('ESCALATED', 'OPEN', 'SYSTEM', null)],
      );
      expect(notifier.answer).not.toHaveBeenCalled();
    });

    it('brings back a ticket whose case no longer exists, so that it is never stuck', async () => {
      store.ticketsWithOtherTeam.mockResolvedValue([
        held('t-1', 'r-deleted'),
        held('t-2', null),
      ]);

      expect(await service.returnDecidedHandovers()).toBe(2);

      expect(store.updateTicket.mock.calls.map((call) => call[2].body)).toEqual(
        ['handover.decided:GONE', 'handover.decided:GONE'],
      );
    });

    it('does nothing, and asks the host nothing, when no ticket is with another team', async () => {
      store.ticketsWithOtherTeam.mockResolvedValue([]);

      expect(await service.returnDecidedHandovers()).toBe(0);
      expect(handover.cases).not.toHaveBeenCalled();
      expect(store.updateTicket).not.toHaveBeenCalled();
    });
  });

  describe('an answer written in the team channel', () => {
    it('becomes a message of the team, solves the ticket and tells the requester', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue({
        ...ticket,
        reference: 42,
        status: 'RESOLVED',
      });

      expect(await service.answerFromTeamChannel('t-1', '  Fixed.  ')).toBe(
        true,
      );

      expect(store.updateTicket).toHaveBeenCalledWith(
        't-1',
        { status: 'RESOLVED', resolvedAt: expect.any(Date) },
        // The channel does not say who of the team wrote it.
        {
          authorKind: 'AGENT',
          authorRef: null,
          visibility: 'PUBLIC',
          body: 'Fixed.',
        },
        [stateEvent('OPEN', 'RESOLVED', 'AGENT', null)],
      );
      expect(notifier.answer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 't-1', email: 'ana@example.com' }),
        'Fixed.',
      );
      expect(staffLog.record).not.toHaveBeenCalled();
    });

    it.each([
      ['does not exist', null],
      ['is closed', { ...ticket, status: 'CLOSED' }],
      ['is already solved', { ...ticket, status: 'RESOLVED' }],
    ])('refuses when the ticket %s', async (_case, found) => {
      store.findTicket.mockResolvedValue(found);

      expect(await service.answerFromTeamChannel('t-1', 'Fixed.')).toBe(false);
      expect(store.updateTicket).not.toHaveBeenCalled();
      expect(notifier.answer).not.toHaveBeenCalled();
    });

    it('refuses while the ticket is with another team', async () => {
      store.findTicket.mockResolvedValue({
        ...ticket,
        status: 'ESCALATED',
        escalatedReportId: 'r-1',
      });
      handover.cases.mockResolvedValue(caseOf('PENDING'));

      expect(await service.answerFromTeamChannel('t-1', 'Fixed.')).toBe(false);
      expect(store.updateTicket).not.toHaveBeenCalled();
    });

    it('refuses an answer that is only spaces without looking for the ticket', async () => {
      expect(await service.answerFromTeamChannel('t-1', '   ')).toBe(false);
      expect(store.findTicket).not.toHaveBeenCalled();
    });
  });

  describe('changing a ticket', () => {
    const escalated = {
      ...ticket,
      status: 'ESCALATED',
      escalatedReportId: 'r-1',
    };

    it.each(['PENDING', 'REVIEWING'])(
      'cannot close a ticket while its case with another team is %s',
      async (status) => {
        store.findTicket.mockResolvedValue(escalated);
        handover.cases.mockResolvedValue(caseOf(status));

        await expect(
          service.updateTicket('admin-1', 't-1', { status: 'CLOSED' }),
        ).rejects.toMatchObject({ status: 409 });
        expect(store.updateTicket).not.toHaveBeenCalled();
        expect(notifier.answer).not.toHaveBeenCalled();
      },
    );

    it.each(['RESOLVED', 'REJECTED'])(
      'goes back to support once its case is %s',
      async (status) => {
        store.findTicket.mockResolvedValue(escalated);
        handover.cases.mockResolvedValue(caseOf(status));
        store.updateTicket.mockResolvedValue({
          ...escalated,
          status: 'RESOLVED',
        });

        await service.updateTicket('admin-1', 't-1', {
          status: 'RESOLVED',
          reply: 'Moderation has acted on it.',
        });

        expect(store.updateTicket).toHaveBeenCalled();
        expect(notifier.answer).toHaveBeenCalled();
      },
    );

    it('an answer sent with the change becomes a message, and the old reply field is not written', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue({ ...ticket, status: 'RESOLVED' });

      await service.updateTicket('admin-1', 't-1', { reply: '  Fixed.  ' });

      const [, changes, message] = store.updateTicket.mock.calls[0];
      expect(changes).toEqual({
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
      });
      expect(changes).not.toHaveProperty('reply');
      expect(message).toEqual({
        authorKind: 'AGENT',
        authorRef: 'admin-1',
        visibility: 'PUBLIC',
        body: 'Fixed.',
      });
      expect(notifier.answer).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@example.com' }),
        'Fixed.',
      );
      expect(staffLog.record).toHaveBeenCalledWith(
        'admin-1',
        't-1',
        expect.stringContaining('(replied)'),
      );
    });

    it('changes the state without telling the requester when there is no answer', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue({ ...ticket, status: 'CLOSED' });

      await service.updateTicket('admin-1', 't-1', { status: 'CLOSED' });

      expect(store.updateTicket.mock.calls[0][2]).toBeUndefined();
      expect(notifier.answer).not.toHaveBeenCalled();
      expect(staffLog.record).toHaveBeenCalled();
    });

    it('adds no message for an answer that is only spaces', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue(ticket);

      await service.updateTicket('admin-1', 't-1', { reply: '   ' });

      expect(store.updateTicket.mock.calls[0]).toEqual([
        't-1',
        {},
        undefined,
        [],
      ]);
      expect(notifier.answer).not.toHaveBeenCalled();
    });

    it('says so when the ticket does not exist', async () => {
      store.findTicket.mockResolvedValue(null);

      await expect(
        service.updateTicket('admin-1', 'missing', { status: 'CLOSED' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('priority, topic and who has the ticket', () => {
    it('changes priority and topic, each with its event', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue(ticket);

      await service.updateTicket('admin-1', 't-1', {
        priority: 'HIGH',
        category: 'PAYMENTS',
      });

      const [, changes, , events] = store.updateTicket.mock.calls[0];
      expect(changes).toEqual({ priority: 'HIGH', category: 'PAYMENTS' });
      expect(events).toEqual([
        {
          kind: 'TOPIC',
          fromValue: 'OTHER',
          toValue: 'PAYMENTS',
          actorKind: 'AGENT',
          actorRef: 'admin-1',
        },
        {
          kind: 'PRIORITY',
          fromValue: 'NORMAL',
          toValue: 'HIGH',
          actorKind: 'AGENT',
          actorRef: 'admin-1',
        },
      ]);
    });

    it('records nothing for a value that stays the same', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue(ticket);

      await service.updateTicket('admin-1', 't-1', { priority: 'NORMAL' });

      expect(store.updateTicket.mock.calls[0][3]).toEqual([]);
    });

    const agent = { ref: 'admin-1', canManage: false };
    const assignment = (fromValue: string | null, toValue: string | null) => ({
      kind: 'ASSIGNMENT',
      fromValue,
      toValue,
      actorKind: 'AGENT',
      actorRef: 'admin-1',
    });

    it('lets an agent take a ticket nobody has', async () => {
      store.findTicket.mockResolvedValue(ticket);
      store.updateTicket.mockResolvedValue({
        ...ticket,
        assignedAgentRef: 'admin-1',
      });

      await service.assign(agent, 't-1', 'admin-1');

      expect(store.updateTicket).toHaveBeenCalledWith(
        't-1',
        { assignedAgentRef: 'admin-1' },
        undefined,
        [assignment(null, 'admin-1')],
      );
      expect(staffLog.record).toHaveBeenCalled();
    });

    it('lets an agent let go of their own ticket', async () => {
      store.findTicket.mockResolvedValue({
        ...ticket,
        assignedAgentRef: 'admin-1',
      });
      store.updateTicket.mockResolvedValue(ticket);

      await service.assign(agent, 't-1', null);

      expect(store.updateTicket.mock.calls[0][3]).toEqual([
        assignment('admin-1', null),
      ]);
    });

    it.each([
      ['take a ticket from someone else', 'admin-2', 'admin-1'],
      ['give a ticket to someone else', null, 'admin-2'],
      ['let go of a ticket of someone else', 'admin-2', null],
    ])('does not let an agent %s', async (_case, current, wanted) => {
      store.findTicket.mockResolvedValue({
        ...ticket,
        assignedAgentRef: current,
      });

      await expect(service.assign(agent, 't-1', wanted)).rejects.toMatchObject({
        status: 403,
      });
      expect(store.updateTicket).not.toHaveBeenCalled();
    });

    it('lets who manages the team assign a ticket to anyone', async () => {
      store.findTicket.mockResolvedValue({
        ...ticket,
        assignedAgentRef: 'admin-2',
      });
      store.updateTicket.mockResolvedValue(ticket);

      await service.assign(
        { ref: 'admin-1', canManage: true },
        't-1',
        'admin-3',
      );

      expect(store.updateTicket.mock.calls[0][3]).toEqual([
        assignment('admin-2', 'admin-3'),
      ]);
    });

    it('says so when the ticket does not exist', async () => {
      store.findTicket.mockResolvedValue(null);

      await expect(
        service.assign(agent, 'missing', 'admin-1'),
      ).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('the account card', () => {
    it('is whatever the host says about who wrote the ticket, and writes nothing', async () => {
      store.findTicket.mockResolvedValue(ticket);
      accountCards.accountCard.mockResolvedValue({ userId: 'u-1' });

      expect(await service.accountCard('t-1')).toEqual({ userId: 'u-1' });
      expect(accountCards.accountCard).toHaveBeenCalledWith('u-1');
      expect(store.updateTicket).not.toHaveBeenCalled();
      expect(staffLog.record).not.toHaveBeenCalled();
    });

    it('is empty for a ticket whose account no longer exists', async () => {
      store.findTicket.mockResolvedValue({ ...ticket, userId: null });

      expect(await service.accountCard('t-1')).toBeNull();
      expect(accountCards.accountCard).not.toHaveBeenCalled();
    });

    it('says so when the ticket does not exist', async () => {
      store.findTicket.mockResolvedValue(null);

      await expect(service.accountCard('missing')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
