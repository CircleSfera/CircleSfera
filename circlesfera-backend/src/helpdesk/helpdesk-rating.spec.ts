import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';
import { InMemoryHelpdeskDb } from './testing/in-memory-helpdesk-db.js';

// The requester says whether the answer was good or bad. The real store and
// service on rows in memory.
describe('Help Desk: rating the answer', () => {
  let db: InMemoryHelpdeskDb;
  let organization: string;
  let tickets: HelpdeskTicketsService;
  let id: string;

  const row = () =>
    db.tickets.find((t) => t.id === id) as Record<string, unknown>;
  const solve = () => Object.assign(row(), { status: 'RESOLVED' });

  beforeEach(async () => {
    vi.resetAllMocks();
    db = new InMemoryHelpdeskDb();
    organization = 'org-a';
    tickets = new HelpdeskTicketsService(
      new HelpdeskStore(db as never, { current: () => organization }),
      { describe: vi.fn().mockResolvedValue(new Map()) },
      { accountCard: vi.fn() },
      {
        open: vi.fn(),
        withdraw: vi.fn(),
        cases: vi.fn().mockResolvedValue(new Map()),
      },
      { answer: vi.fn(), remind: vi.fn(), unmatchedSender: vi.fn() },
      {
        ticketOpened: vi.fn(),
        requesterReplied: vi.fn().mockResolvedValue(undefined),
        emailInTrouble: vi.fn(),
      },
      { record: vi.fn() },
      { describe: vi.fn().mockResolvedValue(new Map()), assignable: vi.fn() },
      { for: () => undefined } as never,
      { levelOf: async () => 'STANDARD' as const },
    );
    id = (
      await tickets.createTicket({
        email: 'ana@example.com',
        subject: 'Help',
        message: 'I cannot get paid',
        userId: 'ana',
      })
    ).ticketId;
  });

  it('stores what the requester thought of a solved ticket, and shows it to them and to the agent', async () => {
    solve();

    const mine = await tickets.rateMyTicket('ana', id, {
      score: 'GOOD',
      comment: '  Fast and clear.  ',
    });

    expect(mine.rating).toMatchObject({
      score: 'GOOD',
      comment: 'Fast and clear.',
    });
    expect((await tickets.getTicket(id)).rating).toMatchObject({
      score: 'GOOD',
      comment: 'Fast and clear.',
    });
    expect(db.ratings).toEqual([
      expect.objectContaining({ organizationId: 'org-a', ticketId: id }),
    ]);
  });

  it('keeps one rating per ticket: rating again replaces it, and a blank comment is none', async () => {
    solve();
    await tickets.rateMyTicket('ana', id, { score: 'GOOD', comment: 'Thanks' });

    const again = await tickets.rateMyTicket('ana', id, {
      score: 'BAD',
      comment: '   ',
    });

    expect(again.rating).toMatchObject({ score: 'BAD', comment: null });
    expect(db.ratings).toHaveLength(1);
  });

  it.each(['OPEN', 'WAITING', 'ESCALATED', 'CLOSED'])(
    'refuses a rating on a ticket that is %s',
    async (status) => {
      Object.assign(row(), { status });

      await expect(
        tickets.rateMyTicket('ana', id, { score: 'GOOD' }),
      ).rejects.toMatchObject({ status: 409 });
      expect(db.ratings).toHaveLength(0);
    },
  );

  it('keeps the rating of a closed ticket, which can no longer be changed', async () => {
    solve();
    await tickets.rateMyTicket('ana', id, { score: 'GOOD' });
    Object.assign(row(), { status: 'CLOSED' });

    await expect(
      tickets.rateMyTicket('ana', id, { score: 'BAD' }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await tickets.getMyTicket('ana', id)).rating).toMatchObject({
      score: 'GOOD',
    });
  });

  it('keeps the rating when the requester answers and the ticket opens again', async () => {
    solve();
    await tickets.rateMyTicket('ana', id, {
      score: 'BAD',
      comment: 'Still broken',
    });

    await tickets.replyToMyTicket('ana', id, { body: 'Still broken' });

    expect(row().status).toBe('OPEN');
    expect((await tickets.getTicket(id)).rating).toMatchObject({
      score: 'BAD',
    });
  });

  it('treats the ticket of someone else as one that does not exist', async () => {
    solve();

    await expect(
      tickets.rateMyTicket('mallory', id, { score: 'BAD' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.ratings).toHaveLength(0);
  });

  it('shows no rating where none was given', async () => {
    expect((await tickets.getMyTicket('ana', id)).rating).toBeNull();
    expect((await tickets.getTicket(id)).rating).toBeNull();
  });

  it('is not seen or given from another organization', async () => {
    solve();
    await tickets.rateMyTicket('ana', id, { score: 'GOOD' });

    organization = 'org-b';

    await expect(
      tickets.rateMyTicket('ana', id, { score: 'BAD' }),
    ).rejects.toMatchObject({ status: 404 });
    const store = new HelpdeskStore(db as never, { current: () => 'org-b' });
    expect(await store.rating(id)).toBeNull();
    expect(db.ratings[0]).toMatchObject({
      score: 'GOOD',
      organizationId: 'org-a',
    });
  });
});
