import { Inject, Injectable } from '@nestjs/common';
import { HelpdeskStore } from './helpdesk.store.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type Level = 'STANDARD' | 'PRIORITY';

/** How one group of tickets was attended, in numbers. */
export interface ServiceFigures {
  opened: number;
  solved: number;
  firstResponse: {
    answered: number;
    /** Share answered within target, 0 to 1. Null with nothing to measure. */
    withinTarget: number | null;
    medianMinutes: number | null;
  };
  resolution: {
    withinTarget: number | null;
    /** Time the ticket was open, its pauses left out. */
    medianMinutes: number | null;
  };
  ratings: { count: number; good: number | null };
}

const share = (part: number, whole: number) =>
  whole === 0 ? null : part / whole;

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round(
    sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2,
  );
};

// How fast and how well support answered over a period: numbers only, no
// ticket, requester or text. A ticket counts in the period in which it was
// opened. One without due times counts as opened or solved and is left out
// of the shares.
@Injectable()
export class HelpdeskFiguresService {
  constructor(@Inject(HelpdeskStore) private readonly store: HelpdeskStore) {}

  async figures(days: 7 | 30) {
    const now = new Date();
    const since = new Date(now.getTime() - days * DAY_MS);
    const [tickets, ratings, pastTarget, standard, priority] =
      await Promise.all([
        this.store.measuredTicketsSince(since),
        this.store.ratingsSince(since),
        this.store.countPastTarget(now),
        this.store.serviceTarget('STANDARD'),
        this.store.serviceTarget('PRIORITY'),
      ]);
    const resolutionMinutes: Record<Level, number | undefined> = {
      STANDARD: standard?.resolutionMinutes,
      PRIORITY: priority?.resolutionMinutes,
    };

    const of = (level?: Level): ServiceFigures => {
      const group = tickets.filter((t) => !level || t.serviceLevel === level);
      const rated = ratings.filter(
        (r) => !level || r.ticket.serviceLevel === level,
      );
      const answered = group.filter((t) => t.firstRespondedAt);
      const answeredMeasured = answered.filter((t) => t.firstResponseDueAt);
      const solved = group.filter(
        (t) => t.resolvedAt && ['RESOLVED', 'CLOSED'].includes(t.status),
      );
      const solvedMeasured = solved.filter((t) => t.resolutionDueAt);
      return {
        opened: group.length,
        solved: solved.length,
        firstResponse: {
          answered: answered.length,
          withinTarget: share(
            answeredMeasured.filter(
              (t) =>
                (t.firstRespondedAt as Date) <= (t.firstResponseDueAt as Date),
            ).length,
            answeredMeasured.length,
          ),
          medianMinutes: median(
            answered.map(
              (t) =>
                ((t.firstRespondedAt as Date).getTime() -
                  t.createdAt.getTime()) /
                MINUTE_MS,
            ),
          ),
        },
        resolution: {
          withinTarget: share(
            solvedMeasured.filter(
              (t) => (t.resolvedAt as Date) <= (t.resolutionDueAt as Date),
            ).length,
            solvedMeasured.length,
          ),
          // The due time moved on by every pause, so the time left when the
          // ticket was solved says how long it was really open.
          medianMinutes: median(
            solvedMeasured.flatMap((t) => {
              const target = resolutionMinutes[t.serviceLevel];
              if (target === undefined) return [];
              const left =
                ((t.resolutionDueAt as Date).getTime() -
                  (t.resolvedAt as Date).getTime()) /
                MINUTE_MS;
              return [Math.max(0, target - left)];
            }),
          ),
        },
        ratings: {
          count: rated.length,
          good: share(
            rated.filter((r) => r.score === 'GOOD').length,
            rated.length,
          ),
        },
      };
    };

    return {
      days,
      since,
      // Open tickets past their target, right now.
      pastTarget,
      total: of(),
      standard: of('STANDARD'),
      priority: of('PRIORITY'),
    };
  }
}
