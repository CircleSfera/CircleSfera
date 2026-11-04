import {
  LIVE_SCHEDULE_MAX_DAYS,
  LIVE_SCHEDULE_MIN_MINUTES,
} from '@circlesfera/shared';

// When a live can be scheduled, as the picker shows it: between the earliest
// and the furthest time the server accepts. The server checks again.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
// The time first offered is rounded up to this many minutes.
const OFFERED_STEP_MINUTES = 5;

/** The earliest and the furthest a live can start, seen from `now`. */
export function liveScheduleBounds(now: number = Date.now()) {
  // The picker counts in whole minutes: the earliest is rounded up, so the
  // first minute it allows is never too soon.
  const earliest =
    Math.ceil((now + LIVE_SCHEDULE_MIN_MINUTES * MINUTE_MS) / MINUTE_MS) *
    MINUTE_MS;
  const furthest =
    Math.floor((now + LIVE_SCHEDULE_MAX_DAYS * DAY_MS) / MINUTE_MS) * MINUTE_MS;
  return { min: new Date(earliest), max: new Date(furthest) };
}

/** The time offered first: the earliest, rounded up to a round minute. */
export function offeredLiveStart(now: number = Date.now()): Date {
  const step = OFFERED_STEP_MINUTES * MINUTE_MS;
  const { min } = liveScheduleBounds(now);
  return new Date(Math.ceil(min.getTime() / step) * step);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as a `datetime-local` field holds it, in the device's time zone. */
export function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** What a `datetime-local` field holds, as a date; null when empty or wrong. */
export function fromLocalInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type LiveScheduleProblem = 'missing' | 'too_soon' | 'too_far';

/** Why a chosen time cannot be scheduled, or null when it can. */
export function liveScheduleProblem(
  startsAt: Date | null,
  now: number = Date.now(),
): LiveScheduleProblem | null {
  if (!startsAt) return 'missing';
  const at = startsAt.getTime();
  if (at < now + LIVE_SCHEDULE_MIN_MINUTES * MINUTE_MS) return 'too_soon';
  if (at > now + LIVE_SCHEDULE_MAX_DAYS * DAY_MS) return 'too_far';
  return null;
}

/**
 * When a scheduled live starts, in the reader's language and time zone: the
 * day of the week, the day, the month, the year when it is not this one,
 * and the time.
 */
export function formatLiveStart(
  value: string | Date,
  language: string,
  now: number = Date.now(),
): string {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleString(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}
