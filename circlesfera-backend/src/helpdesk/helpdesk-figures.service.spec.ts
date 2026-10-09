import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskFiguresService } from './helpdesk-figures.service.js';
import { InMemoryHelpdeskDb } from './testing/in-memory-helpdesk-db.js';

// The figures of a known set of tickets, counted by hand in each test.
describe('Help Desk: figures for the lead', () => {
  const HOUR = 60 * 60 * 1000;
  const NOW = Date.parse('2026-03-20T00:00:00Z');
  const ago = (hours: number) => new Date(NOW - hours * HOUR);

  let db: InMemoryHelpdeskDb;
  let organization: string;
  let figures: HelpdeskFiguresService;
  let n = 0;

  // A ticket opened some hours ago. Its due times follow its level unless
  // the test says otherwise; hours are counted from its opening.
  const ticket = (
    openedHoursAgo: number,
    o: {
      level?: 'STANDARD' | 'PRIORITY';
      respondedAfter?: number;
      solvedAfter?: number;
      // Hours of pause before it was solved.
      paused?: number;
      status?: string;
      unmeasured?: boolean;
      rating?: 'GOOD' | 'BAD';
      org?: string;
    } = {},
  ) => {
    const level = o.level ?? 'STANDARD';
    const created = ago(openedHoursAgo);
    const sinceOpening = (hours: number) =>
      new Date(created.getTime() + hours * HOUR);
    const id = `t-${++n}`;
    db.tickets.push({
      id,
      organizationId: o.org ?? 'org-a',
      serviceLevel: level,
      status: o.status ?? (o.solvedAfter === undefined ? 'OPEN' : 'RESOLVED'),
      createdAt: created,
      firstResponseDueAt: o.unmeasured
        ? null
        : sinceOpening(level === 'PRIORITY' ? 4 : 24),
      firstRespondedAt:
        o.respondedAfter === undefined ? null : sinceOpening(o.respondedAfter),
      resolutionDueAt: o.unmeasured ? null : sinceOpening(72 + (o.paused ?? 0)),
      resolvedAt:
        o.solvedAfter === undefined ? null : sinceOpening(o.solvedAfter),
    });
    if (o.rating) {
      db.ratings.push({
        id: `g-${n}`,
        organizationId: o.org ?? 'org-a',
        ticketId: id,
        score: o.rating,
        comment: 'not for the figures',
      });
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
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
    );
    figures = new HelpdeskFiguresService(
      new HelpdeskStore(db as never, { current: () => organization }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives nothing to measure as a dash, not as zero', async () => {
    const result = await figures.figures(7);

    expect(result).toMatchObject({ days: 7, pastTarget: 0 });
    expect(result.since).toEqual(ago(7 * 24));
    expect(result.total).toEqual({
      opened: 0,
      solved: 0,
      firstResponse: { answered: 0, withinTarget: null, medianMinutes: null },
      resolution: { withinTarget: null, medianMinutes: null },
      ratings: { count: 0, good: null },
    });
  });

  it('counts first responses, the share within target and the median time', async () => {
    ticket(100, { respondedAfter: 2 });
    ticket(100, { respondedAfter: 10 });
    ticket(100, { respondedAfter: 30 }); // late: the target is 24 hours
    ticket(100); // never answered
    ticket(100, { respondedAfter: 50, unmeasured: true }); // counts as answered only

    const { total } = await figures.figures(7);

    expect(total.opened).toBe(5);
    expect(total.firstResponse).toEqual({
      answered: 4,
      withinTarget: 2 / 3,
      // Of 2, 10, 30 and 50 hours.
      medianMinutes: 20 * 60,
    });
  });

  it('counts resolutions within target, and the median time open with pauses left out', async () => {
    ticket(150, { respondedAfter: 1, solvedAfter: 10 });
    // Solved 100 hours after opening, of which 60 were waiting: 40 hours open.
    ticket(150, { respondedAfter: 1, solvedAfter: 100, paused: 60 });
    // 80 hours open with no pause: late.
    ticket(150, { respondedAfter: 1, solvedAfter: 80 });
    ticket(150, { respondedAfter: 1, solvedAfter: 5, unmeasured: true });
    // Marked solved in the data but reopened since: not solved.
    ticket(150, { respondedAfter: 1, solvedAfter: 5, status: 'OPEN' });

    const { total } = await figures.figures(7);

    expect(total.solved).toBe(4);
    expect(total.resolution).toEqual({
      withinTarget: 2 / 3,
      // Of 10, 40 and 80 hours open.
      medianMinutes: 40 * 60,
    });
  });

  it('gives each service level its own figures, and the total of both', async () => {
    ticket(50, { level: 'PRIORITY', respondedAfter: 3, rating: 'GOOD' });
    ticket(50, { level: 'PRIORITY', respondedAfter: 6, rating: 'BAD' }); // late for 4 hours
    ticket(50, { level: 'STANDARD', respondedAfter: 6, rating: 'GOOD' });

    const result = await figures.figures(7);

    expect(result.priority.firstResponse).toMatchObject({
      answered: 2,
      withinTarget: 0.5,
    });
    expect(result.standard.firstResponse).toMatchObject({
      answered: 1,
      withinTarget: 1,
    });
    expect(result.total.firstResponse).toMatchObject({
      answered: 3,
      withinTarget: 2 / 3,
    });
    expect(result.priority.ratings).toEqual({ count: 2, good: 0.5 });
    expect(result.standard.ratings).toEqual({ count: 1, good: 1 });
    expect(result.total.ratings).toEqual({ count: 3, good: 2 / 3 });
  });

  it('counts a ticket in the period in which it was opened', async () => {
    ticket(24 * 6, { respondedAfter: 1 });
    ticket(24 * 10, { respondedAfter: 1, rating: 'GOOD' });
    ticket(24 * 40, { respondedAfter: 1 });

    expect((await figures.figures(7)).total).toMatchObject({
      opened: 1,
      ratings: { count: 0 },
    });
    expect((await figures.figures(30)).total).toMatchObject({
      opened: 2,
      ratings: { count: 1 },
    });
  });

  it('says how many open tickets are past their target right now, whenever they were opened', async () => {
    ticket(24 * 60); // open for two months, never answered
    ticket(30); // first response late
    ticket(80, { respondedAfter: 1 }); // answered, resolution late
    ticket(10); // in time
    ticket(200, { respondedAfter: 1, solvedAfter: 5 }); // solved
    ticket(500, { status: 'WAITING' });

    expect((await figures.figures(7)).pastTarget).toBe(3);
  });

  it('leaves the median of the time open out when the organization has no target to measure it by', async () => {
    db.serviceTargets.length = 0;
    ticket(50, { respondedAfter: 1, solvedAfter: 10 });

    const { total } = await figures.figures(7);

    expect(total.resolution).toEqual({ withinTarget: 1, medianMinutes: null });
  });

  it('counts only its own organization', async () => {
    ticket(50, { respondedAfter: 1, rating: 'GOOD' });
    ticket(50, { org: 'org-b', respondedAfter: 1, rating: 'BAD' });
    ticket(50, { org: 'org-b' });

    expect((await figures.figures(7)).total).toMatchObject({
      opened: 1,
      ratings: { count: 1, good: 1 },
    });
    expect((await figures.figures(7)).pastTarget).toBe(0);
    organization = 'org-b';
    expect((await figures.figures(7)).total).toMatchObject({
      opened: 2,
      ratings: { count: 1, good: 0 },
    });
    expect((await figures.figures(7)).pastTarget).toBe(1);
  });

  it('carries no ticket, requester or text', async () => {
    ticket(50, { respondedAfter: 1, solvedAfter: 3, rating: 'BAD' });

    const text = JSON.stringify(await figures.figures(7));

    expect(text).not.toMatch(/t-\d|not for the figures|ticketId|comment/);
  });
});
