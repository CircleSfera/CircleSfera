import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskDataPort } from './helpdesk-data.port.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';
import { InMemoryHelpdeskDb } from './testing/in-memory-helpdesk-db.js';

// Two organizations on one database. Every operation of the Help Desk, the
// ones behind each route and the ones the rest of the product may ask, is
// run as the second organization and must neither return nor change
// anything of the first. The same person writes to both, so the person
// alone cannot be what keeps them apart.
describe('Help Desk: isolation between two organizations', () => {
  const FAR_FUTURE = new Date('2100-01-01T00:00:00Z');
  const EPOCH = new Date(0);

  let db: InMemoryHelpdeskDb;
  let current: 'org-a' | 'org-b';
  let store: HelpdeskStore;
  let tickets: HelpdeskTicketsService;
  let port: HelpdeskDataPort;
  const handover = {
    open: vi.fn(),
    withdraw: vi.fn(),
    cases: vi.fn(),
  };
  const notifier = { answer: vi.fn() };
  const accountCards = { accountCard: vi.fn() };

  // What belongs to the first organization, by name.
  let a: { open: string; shared: string; solved: string; handed: string };

  const as = (organization: 'org-a' | 'org-b') => {
    current = organization;
  };
  const ticket = (id: string) => db.tickets.find((t) => t.id === id);
  const snapshot = () =>
    JSON.stringify({
      tickets: db.tickets.filter((t) => t.organizationId === 'org-a'),
      messages: db.messages.filter((m) =>
        Object.values(a).includes(m.ticketId as string),
      ),
    });
  const idsOf = (rows: { id?: unknown }[]) => rows.map((row) => row.id);
  const ofOrgA = (id: unknown) =>
    db.tickets.some((t) => t.id === id && t.organizationId === 'org-a');

  const open = async (requester: string, subject: string) =>
    (
      await tickets.createTicket({
        email: `${requester}@example.com`,
        subject,
        message: `${subject}: first message`,
        userId: requester,
      })
    ).ticketId;

  beforeEach(async () => {
    vi.resetAllMocks();
    db = new InMemoryHelpdeskDb();
    store = new HelpdeskStore(db as never, { current: () => current });
    handover.cases.mockImplementation(
      async (refs: string[]) =>
        new Map(
          refs.map((ref) => [
            ref,
            { id: ref, status: 'RESOLVED', pending: false },
          ]),
        ),
    );
    handover.open.mockResolvedValue({ caseRef: 'case-new' });
    accountCards.accountCard.mockResolvedValue({ plan: 'secret of org a' });
    tickets = new HelpdeskTicketsService(
      store,
      { describe: vi.fn().mockResolvedValue(new Map()) },
      accountCards,
      handover,
      notifier,
      {
        ticketOpened: vi.fn(),
        requesterReplied: vi.fn().mockResolvedValue(undefined),
      },
      { record: vi.fn() },
    );
    port = new HelpdeskDataPort(store, { get: () => tickets } as never);

    as('org-a');
    a = {
      open: await open('ana', 'A open'),
      shared: await open('shared', 'A of the shared person'),
      solved: await open('ana', 'A solved long ago'),
      handed: await open('ana', 'A with another team'),
    };
    await tickets.addMessage('agent-a', a.open, {
      body: 'internal note of org a',
      visibility: 'INTERNAL',
    });
    Object.assign(ticket(a.solved) as object, {
      status: 'RESOLVED',
      resolvedAt: new Date('2025-01-01T00:00:00Z'),
    });
    Object.assign(ticket(a.handed) as object, {
      status: 'ESCALATED',
      escalatedReportId: 'case-a',
    });

    as('org-b');
    await open('bea', 'B open');
    await open('shared', 'B of the shared person');
    const solvedB = await open('bea', 'B solved long ago');
    Object.assign(ticket(solvedB) as object, {
      status: 'RESOLVED',
      resolvedAt: new Date('2025-01-01T00:00:00Z'),
    });
    vi.clearAllMocks();
  });

  // Every public operation, run as the second organization. `leak` says
  // what would show that something of the first one came back.
  const operations: Record<
    string,
    () => Promise<{ leaked: boolean; note?: string }>
  > = {
    // --- behind the agent routes ---
    listTickets: async () => {
      const { data } = await tickets.listTickets(1, 100);
      return { leaked: data.length !== 3 || idsOf(data).some(ofOrgA) };
    },
    getTicket: async () => ({
      leaked: await tickets.getTicket(a.open).then(
        () => true,
        (error) => error.status !== 404,
      ),
    }),
    addMessage: async () => ({
      leaked: await tickets
        .addMessage('agent-b', a.open, { body: 'hello', visibility: 'PUBLIC' })
        .then(
          () => true,
          (error) => error.status !== 404,
        ),
    }),
    updateTicket: async () => ({
      leaked: await tickets
        .updateTicket('agent-b', a.open, { status: 'CLOSED' })
        .then(
          () => true,
          (error) => error.status !== 404,
        ),
    }),
    handOver: async () => {
      const refused = await tickets.handOver('agent-b', a.open).then(
        () => false,
        (error) => error.status === 404,
      );
      return { leaked: !refused || handover.open.mock.calls.length > 0 };
    },
    accountCard: async () => {
      const refused = await tickets.accountCard(a.open).then(
        () => false,
        (error) => error.status === 404,
      );
      return {
        leaked: !refused || accountCards.accountCard.mock.calls.length > 0,
      };
    },
    answerFromTeamChannel: async () => ({
      leaked:
        (await tickets.answerFromTeamChannel(a.open, 'hello')) ||
        notifier.answer.mock.calls.length > 0,
    }),

    // --- behind the requester routes, as the person both share ---
    createTicket: async () => {
      const id = await open('shared', 'another of B');
      return { leaked: ticket(id)?.organizationId !== 'org-b' };
    },
    listMyTickets: async () => {
      const { data } = await tickets.listMyTickets('shared', 1, 100);
      return { leaked: data.length !== 1 || idsOf(data).some(ofOrgA) };
    },
    getMyTicket: async () => ({
      leaked: await tickets.getMyTicket('shared', a.shared).then(
        () => true,
        (error) => error.status !== 404,
      ),
    }),
    replyToMyTicket: async () => ({
      leaked: await tickets
        .replyToMyTicket('shared', a.shared, { body: 'hello' })
        .then(
          () => true,
          (error) => error.status !== 404,
        ),
    }),

    // --- on a schedule ---
    closeSolvedTickets: async () => {
      const closed = await tickets.closeSolvedTickets();
      return {
        leaked: closed !== 1 || ticket(a.solved)?.status !== 'RESOLVED',
      };
    },
    returnDecidedHandovers: async () => ({
      leaked:
        (await tickets.returnDecidedHandovers()) !== 0 ||
        ticket(a.handed)?.status !== 'ESCALATED',
    }),

    // --- what the rest of the product may ask ---
    exportForRequester: async () => {
      const rows = await port.exportForRequester('shared');
      return { leaked: rows.length !== 1 || idsOf(rows).some(ofOrgA) };
    },
    deleteEndedBefore: async () => {
      const { count } = await port.deleteEndedBefore(FAR_FUTURE);
      return { leaked: count !== 1 || !ticket(a.solved) };
    },
    ticketFactsSince: async () => {
      const rows = await port.ticketFactsSince(EPOCH);
      return { leaked: rows.length !== 3 || idsOf(rows).some(ofOrgA) };
    },
    openTickets: async () => {
      const { tickets: rows, total } = await port.openTickets(100);
      return { leaked: total !== 2 || idsOf(rows).some(ofOrgA) };
    },
    resolutionTimesSince: async () => ({
      leaked: (await port.resolutionTimesSince(EPOCH, 100)).length !== 1,
    }),
  };

  it.each(Object.keys(operations))(
    '%s: nothing of the first organization is returned or changed',
    async (name) => {
      as('org-b');
      const before = snapshot();

      const { leaked } = await operations[name]();

      expect(leaked).toBe(false);
      expect(snapshot()).toBe(before);
    },
  );

  // The service looks a ticket up before it reads its messages or changes
  // it, so those two are also guarded one level up. The store is asked
  // directly here: it must hold on its own.
  it('the store refuses to change a ticket of the first organization, or read its messages', async () => {
    as('org-b');
    const before = snapshot();

    await expect(
      store.updateTicket(a.open, { status: 'CLOSED' }),
    ).rejects.toMatchObject({ code: 'P2025' });
    await expect(
      store.updateTicket(
        a.open,
        {},
        {
          authorKind: 'AGENT',
          authorRef: 'agent-b',
          visibility: 'PUBLIC',
          body: 'x',
        },
      ),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect(await store.messages(a.open)).toEqual([]);
    expect(snapshot()).toBe(before);
  });

  it('covers every operation of the tickets service and of the data port', () => {
    const publicMethods = (prototype: object) =>
      Object.getOwnPropertyNames(prototype).filter(
        (name) =>
          name !== 'constructor' &&
          typeof Object.getOwnPropertyDescriptor(prototype, name)?.value ===
            'function',
      );
    // TypeScript's `private` is still a method at run time: the ones the
    // service keeps for itself are named here, so a new public operation
    // without a case above fails this test.
    const internal = new Set([
      'requesterView',
      'noticeOf',
      'requesterTicketOrFail',
      'ticketOrFail',
      'isHeldByOtherTeam',
    ]);
    const all = [
      ...publicMethods(HelpdeskTicketsService.prototype),
      ...publicMethods(HelpdeskDataPort.prototype),
    ].filter((name) => !internal.has(name));

    expect([...new Set(all)].sort()).toEqual(Object.keys(operations).sort());
  });

  it('is not passing by returning nothing: the first organization sees its own', async () => {
    as('org-a');

    expect((await tickets.listTickets(1, 100)).data).toHaveLength(4);
    const own = await tickets.getTicket(a.open);
    expect(own.messages.map((m) => m.visibility)).toEqual([
      'PUBLIC',
      'INTERNAL',
    ]);
    expect((await tickets.listMyTickets('shared', 1, 100)).data).toHaveLength(
      1,
    );
    expect(await port.exportForRequester('shared')).toHaveLength(1);
    expect((await port.openTickets(100)).total).toBe(2);
    expect(await tickets.returnDecidedHandovers()).toBe(1);
    expect(await tickets.closeSolvedTickets()).toBe(1);
  });

  it('would catch a query that forgets the organization', async () => {
    // The same list, asked of the database without the organization, is what
    // a forgotten filter would return: it holds tickets of both.
    const unscoped = await db.supportTicket.findMany({ where: {} });

    expect(idsOf(unscoped).some(ofOrgA)).toBe(true);
    expect(unscoped.some((t) => t.organizationId === 'org-b')).toBe(true);
  });
});
