import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';
import { InMemoryHelpdeskDb } from './testing/in-memory-helpdesk-db.js';

// What a ticket is measured by: its service level, its due times, the first
// response and the pauses of its clock. The real store and service on rows
// in memory, with the clock in the hands of the test.
describe('Help Desk: service level and due times', () => {
  const HOUR = 60 * 60 * 1000;
  const START = Date.parse('2026-03-01T00:00:00Z');
  const at = (hours: number) => new Date(START + hours * HOUR);
  const atHour = (hours: number) => vi.setSystemTime(at(hours));

  let db: InMemoryHelpdeskDb;
  let organization: string;
  let tickets: HelpdeskTicketsService;
  const serviceLevels = { levelOf: vi.fn() };
  const handover = { open: vi.fn(), withdraw: vi.fn(), cases: vi.fn() };

  const row = (id: string) =>
    db.tickets.find((t) => t.id === id) as Record<string, unknown>;
  const open = async (requester = 'ana') =>
    (
      await tickets.createTicket({
        email: `${requester}@example.com`,
        subject: 'Help',
        message: 'I cannot get paid',
        userId: requester,
      })
    ).ticketId;
  const answer = (id: string, status: 'OPEN' | 'WAITING' | 'RESOLVED') =>
    tickets.addMessage('agent-1', id, {
      body: 'An answer',
      visibility: 'PUBLIC',
      status,
    });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    atHour(0);
    db = new InMemoryHelpdeskDb();
    organization = 'org-a';
    db.serviceTargets.push(
      {
        organizationId: 'org-a',
        serviceLevel: 'STANDARD',
        firstResponseMinutes: 1440,
        resolutionMinutes: 4320,
      },
      {
        organizationId: 'org-a',
        serviceLevel: 'PRIORITY',
        firstResponseMinutes: 240,
        resolutionMinutes: 4320,
      },
      {
        organizationId: 'org-b',
        serviceLevel: 'STANDARD',
        firstResponseMinutes: 60,
        resolutionMinutes: 120,
      },
    );
    serviceLevels.levelOf.mockResolvedValue('STANDARD');
    handover.open.mockResolvedValue({ caseRef: 'case-1' });
    handover.cases.mockResolvedValue(new Map());
    tickets = new HelpdeskTicketsService(
      new HelpdeskStore(db as never, { current: () => organization }),
      { describe: vi.fn().mockResolvedValue(new Map()) },
      { accountCard: vi.fn() },
      handover,
      { answer: vi.fn(), remind: vi.fn(), unmatchedSender: vi.fn() },
      {
        ticketOpened: vi.fn(),
        requesterReplied: vi.fn().mockResolvedValue(undefined),
        emailInTrouble: vi.fn(),
      },
      { record: vi.fn() },
      { describe: vi.fn().mockResolvedValue(new Map()), assignable: vi.fn() },
      { for: () => undefined } as never,
      serviceLevels,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('when a ticket is opened', () => {
    it('gives a requester without a plan the standard level, normal priority and its two due times', async () => {
      const id = await open();

      expect(serviceLevels.levelOf).toHaveBeenCalledWith('ana');
      expect(row(id)).toMatchObject({
        serviceLevel: 'STANDARD',
        priority: 'NORMAL',
        firstResponseDueAt: at(24),
        resolutionDueAt: at(72),
        firstRespondedAt: null,
        pausedAt: null,
      });
    });

    it('gives a requester on a paid plan preference: high priority and a first response in four hours', async () => {
      serviceLevels.levelOf.mockResolvedValue('PRIORITY');

      const id = await open();

      expect(row(id)).toMatchObject({
        serviceLevel: 'PRIORITY',
        priority: 'HIGH',
        firstResponseDueAt: at(4),
        resolutionDueAt: at(72),
      });
    });

    it('treats the requester as standard when the host cannot say', async () => {
      serviceLevels.levelOf.mockRejectedValue(new Error('down'));

      expect(row(await open())).toMatchObject({
        serviceLevel: 'STANDARD',
        priority: 'NORMAL',
        firstResponseDueAt: at(24),
      });
    });

    it('uses the targets of its own organization, and measures nothing where there are none', async () => {
      organization = 'org-b';
      expect(row(await open())).toMatchObject({
        firstResponseDueAt: at(1),
        resolutionDueAt: at(2),
      });

      // That organization has no targets for the priority level.
      serviceLevels.levelOf.mockResolvedValue('PRIORITY');
      expect(row(await open())).toMatchObject({
        serviceLevel: 'PRIORITY',
        priority: 'HIGH',
        firstResponseDueAt: null,
        resolutionDueAt: null,
      });
    });

    it('measures a ticket that continues a closed one on its own, at the level of that moment', async () => {
      const id = await open();
      Object.assign(row(id), { status: 'CLOSED' });
      serviceLevels.levelOf.mockResolvedValue('PRIORITY');
      atHour(100);

      await tickets.replyToMyTicket('ana', id, { body: 'Again' });

      const continued = db.tickets.find((t) => t.previousTicketId === id);
      expect(continued).toMatchObject({
        serviceLevel: 'PRIORITY',
        priority: 'HIGH',
        firstResponseDueAt: at(104),
        resolutionDueAt: at(172),
      });
      // A requester the host no longer knows is standard, without asking.
      Object.assign(continued as object, { status: 'CLOSED', userId: null });
      serviceLevels.levelOf.mockClear();
      await tickets.replyByEmail(continued?.id as string, 'Once more');
      expect(serviceLevels.levelOf).not.toHaveBeenCalled();
      expect(db.tickets.at(-1)).toMatchObject({ serviceLevel: 'STANDARD' });
    });
  });

  describe('the first response', () => {
    it('is the first public answer of an agent, recorded once', async () => {
      const id = await open();
      atHour(3);
      await answer(id, 'OPEN');
      atHour(9);
      await answer(id, 'OPEN');

      expect(row(id).firstRespondedAt).toEqual(at(3));
    });

    it('is not an internal note, nor what the requester writes', async () => {
      const id = await open();
      atHour(1);
      await tickets.addMessage('agent-1', id, {
        body: 'A note',
        visibility: 'INTERNAL',
      });
      await tickets.replyToMyTicket('ana', id, { body: 'Any news?' });

      expect(row(id).firstRespondedAt).toBeNull();
    });

    it('counts an answer from the team channel, and one sent with a change of the ticket', async () => {
      const viaChannel = await open();
      const viaChange = await open();
      atHour(2);
      await tickets.answerFromTeamChannel(viaChannel, 'Fixed.');
      await tickets.updateTicket('agent-1', viaChange, { reply: 'Fixed.' });

      expect(row(viaChannel).firstRespondedAt).toEqual(at(2));
      expect(row(viaChange).firstRespondedAt).toEqual(at(2));
    });
  });

  describe('the resolution clock', () => {
    it('stops while the ticket waits for the requester, and moves on by exactly that time', async () => {
      const id = await open();
      atHour(10);
      await answer(id, 'WAITING');
      expect(row(id)).toMatchObject({
        pausedAt: at(10),
        resolutionDueAt: at(72),
      });

      atHour(40);
      await tickets.replyToMyTicket('ana', id, { body: 'Here it is' });

      expect(row(id)).toMatchObject({
        status: 'OPEN',
        pausedAt: null,
        resolutionDueAt: at(102),
      });
      // The first response clock never stops.
      expect(row(id).firstResponseDueAt).toEqual(at(24));
    });

    it('adds up two pauses', async () => {
      const id = await open();
      atHour(10);
      await answer(id, 'WAITING');
      atHour(15);
      await tickets.replyToMyTicket('ana', id, { body: 'One' });
      atHour(20);
      await answer(id, 'WAITING');
      atHour(30);
      await tickets.replyToMyTicket('ana', id, { body: 'Two' });

      expect(row(id).resolutionDueAt).toEqual(at(72 + 5 + 10));
    });

    it('does not restart when a solved ticket opens again: the time solved is a pause', async () => {
      const id = await open();
      atHour(5);
      await answer(id, 'RESOLVED');
      expect(row(id).pausedAt).toEqual(at(5));

      atHour(25);
      await tickets.replyToMyTicket('ana', id, { body: 'Not fixed' });

      expect(row(id)).toMatchObject({
        pausedAt: null,
        resolutionDueAt: at(92),
      });
    });

    it('keeps the start of the pause when the ticket goes from waiting to solved', async () => {
      const id = await open();
      atHour(10);
      await answer(id, 'WAITING');
      atHour(24 * 15);
      Object.assign(row(id), { waitingRemindedAt: at(24 * 7) });
      await tickets.solveUnansweredTickets();

      expect(row(id)).toMatchObject({ status: 'RESOLVED', pausedAt: at(10) });
    });

    it('stops while the ticket is with another team, and runs again when it comes back', async () => {
      const id = await open();
      atHour(8);
      await tickets.handOver('agent-1', id);
      expect(row(id)).toMatchObject({ status: 'ESCALATED', pausedAt: at(8) });

      atHour(20);
      expect(await tickets.returnDecidedHandovers()).toBe(1);

      expect(row(id)).toMatchObject({
        status: 'OPEN',
        pausedAt: null,
        resolutionDueAt: at(84),
      });
    });

    it('does not stop for an answer that leaves the ticket open, a note, a priority or an assignment', async () => {
      const id = await open();
      atHour(5);
      await answer(id, 'OPEN');
      await tickets.addMessage('agent-1', id, {
        body: 'A note',
        visibility: 'INTERNAL',
      });
      await tickets.updateTicket('agent-1', id, { priority: 'HIGH' });

      expect(row(id)).toMatchObject({
        pausedAt: null,
        resolutionDueAt: at(72),
      });
    });

    it('leaves a ticket that is not measured without due times, whatever happens to it', async () => {
      const id = await open();
      Object.assign(row(id), {
        firstResponseDueAt: null,
        resolutionDueAt: null,
      });
      atHour(5);
      await answer(id, 'WAITING');
      atHour(9);
      await tickets.replyToMyTicket('ana', id, { body: 'Here' });

      expect(row(id)).toMatchObject({
        status: 'OPEN',
        pausedAt: null,
        resolutionDueAt: null,
        firstRespondedAt: at(5),
      });
    });
  });
});
