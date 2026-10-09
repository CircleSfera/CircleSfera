import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';
import { InMemoryHelpdeskDb } from './testing/in-memory-helpdesk-db.js';

// A ticket that waits for its requester: one reminder after seven days,
// solved seven days after the reminder, and an answer from either side
// starts over. Run against rows in memory, whose clock starts on the first
// of January 2026 and moves a second with each write.
describe('Help Desk: tickets waiting for their requester', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const START = Date.parse('2026-01-01T00:00:00Z');

  let db: InMemoryHelpdeskDb;
  let tickets: HelpdeskTicketsService;
  const notifier = { answer: vi.fn(), remind: vi.fn() };
  const agents = { describe: vi.fn(), assignable: vi.fn() };

  const row = (id: string) => db.tickets.find((t) => t.id === id);
  const onDay = (day: number) => vi.setSystemTime(START + day * DAY);

  // A ticket an agent answered and left waiting for its requester.
  const waitingTicket = async () => {
    const { ticketId } = await tickets.createTicket({
      email: 'ana@example.com',
      subject: 'Help',
      message: 'I cannot sign in',
      userId: 'ana',
    });
    await tickets.addMessage('agent-1', ticketId, {
      body: 'Which email do you use?',
      visibility: 'PUBLIC',
      status: 'WAITING',
    });
    return ticketId;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    onDay(0);
    agents.describe.mockResolvedValue(new Map());
    db = new InMemoryHelpdeskDb();
    tickets = new HelpdeskTicketsService(
      new HelpdeskStore(db as never, { current: () => 'org-1' }),
      { describe: vi.fn().mockResolvedValue(new Map()) },
      { accountCard: vi.fn() },
      { open: vi.fn(), withdraw: vi.fn(), cases: vi.fn() },
      notifier,
      {
        ticketOpened: vi.fn(),
        requesterReplied: vi.fn().mockResolvedValue(undefined),
      },
      { record: vi.fn() },
      agents,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves alone a ticket that has waited less than seven days', async () => {
    const id = await waitingTicket();
    onDay(6);

    expect(await tickets.remindWaitingTickets()).toBe(0);

    expect(notifier.remind).not.toHaveBeenCalled();
    expect(row(id)?.waitingRemindedAt).toBeNull();
  });

  it('reminds once a ticket that has waited seven days, and says when it will be solved', async () => {
    const id = await waitingTicket();
    onDay(8);

    expect(await tickets.remindWaitingTickets()).toBe(1);
    expect(await tickets.remindWaitingTickets()).toBe(0);

    expect(notifier.remind).toHaveBeenCalledTimes(1);
    expect(notifier.remind).toHaveBeenCalledWith(
      {
        id,
        reference: 1,
        subject: 'Help',
        email: 'ana@example.com',
        requesterRef: 'ana',
      },
      7,
    );
    expect(row(id)?.waitingRemindedAt).toEqual(new Date(START + 8 * DAY));
  });

  it('does not remind about tickets that are open, solved or closed', async () => {
    const id = await waitingTicket();
    onDay(8);

    for (const status of ['OPEN', 'RESOLVED', 'CLOSED', 'ESCALATED']) {
      Object.assign(row(id) as object, { status });
      expect(await tickets.remindWaitingTickets()).toBe(0);
    }
  });

  it('tries again on the next run when the reminder could not be sent', async () => {
    const id = await waitingTicket();
    onDay(8);
    notifier.remind.mockRejectedValueOnce(new Error('mail down'));

    expect(await tickets.remindWaitingTickets()).toBe(0);
    expect(row(id)?.waitingRemindedAt).toBeNull();

    notifier.remind.mockRejectedValueOnce('mail down');
    expect(await tickets.remindWaitingTickets()).toBe(0);

    expect(await tickets.remindWaitingTickets()).toBe(1);
    expect(notifier.remind).toHaveBeenCalledTimes(3);
  });

  it('sends one reminder when two runs find the same ticket', async () => {
    const id = await waitingTicket();
    onDay(8);
    // The other run marks the ticket between the search and the mark.
    const store = (tickets as unknown as { store: HelpdeskStore }).store;
    const found = await store.ticketsWaitingSinceBefore(new Date(), 10);
    vi.spyOn(store, 'ticketsWaitingSinceBefore').mockResolvedValue(found);
    Object.assign(row(id) as object, { waitingRemindedAt: new Date() });

    expect(await tickets.remindWaitingTickets()).toBe(0);
    expect(notifier.remind).not.toHaveBeenCalled();
  });

  it('starts the wait again when the agent writes again while it waits', async () => {
    const id = await waitingTicket();
    onDay(8);
    expect(await tickets.remindWaitingTickets()).toBe(1);

    await tickets.addMessage('agent-1', id, {
      body: 'Are you still there?',
      visibility: 'PUBLIC',
      status: 'WAITING',
    });
    // Rows are dated by the clock of the test database: the second answer
    // was written on day 8.
    Object.assign(db.messages.at(-1) as object, {
      createdAt: new Date(START + 8 * DAY),
    });

    expect(row(id)?.waitingRemindedAt).toBeNull();
    onDay(14);
    expect(await tickets.solveUnansweredTickets()).toBe(0);
    expect(await tickets.remindWaitingTickets()).toBe(0);
    onDay(16);
    expect(await tickets.remindWaitingTickets()).toBe(1);
    expect(notifier.remind).toHaveBeenCalledTimes(2);
  });

  it('counts the wait from the change to waiting when no message came with it', async () => {
    const { ticketId } = await tickets.createTicket({
      email: 'ana@example.com',
      subject: 'Help',
      message: 'I cannot sign in',
      userId: 'ana',
    });
    await tickets.updateTicket('agent-1', ticketId, { status: 'WAITING' });
    const changed = db.events.find((e) => e.toValue === 'WAITING');
    // The change was made on day 5; the first message is from day 0.
    Object.assign(changed as object, { createdAt: new Date(START + 5 * DAY) });

    onDay(8);
    expect(await tickets.remindWaitingTickets()).toBe(0);
    onDay(13);
    expect(await tickets.remindWaitingTickets()).toBe(1);
  });

  it('solves, as the system, a ticket reminded seven days ago and still unanswered', async () => {
    const id = await waitingTicket();
    onDay(8);
    await tickets.remindWaitingTickets();

    onDay(14);
    expect(await tickets.solveUnansweredTickets()).toBe(0);
    expect(row(id)?.status).toBe('WAITING');

    onDay(16);
    expect(await tickets.solveUnansweredTickets()).toBe(1);
    expect(await tickets.solveUnansweredTickets()).toBe(0);

    expect(row(id)).toMatchObject({
      status: 'RESOLVED',
      resolvedAt: new Date(START + 16 * DAY),
    });
    expect(db.events.at(-1)).toMatchObject({
      ticketId: id,
      kind: 'STATE',
      fromValue: 'WAITING',
      toValue: 'RESOLVED',
      actorKind: 'SYSTEM',
      actorRef: null,
    });
    // The reminder already said it: nothing else is sent.
    expect(notifier.answer).toHaveBeenCalledTimes(1);
  });

  it('a reply from the requester cancels the reminder and the solving', async () => {
    const id = await waitingTicket();
    onDay(8);
    await tickets.remindWaitingTickets();

    await tickets.replyToMyTicket('ana', id, { body: 'The one I wrote from' });
    onDay(30);

    expect(await tickets.solveUnansweredTickets()).toBe(0);
    expect(await tickets.remindWaitingTickets()).toBe(0);
    expect(row(id)).toMatchObject({ status: 'OPEN', waitingRemindedAt: null });
  });
});
