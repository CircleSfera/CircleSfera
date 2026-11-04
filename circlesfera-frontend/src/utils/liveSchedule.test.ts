import {
  LIVE_SCHEDULE_MAX_DAYS,
  LIVE_SCHEDULE_MIN_MINUTES,
} from '@circlesfera/shared';
import { describe, expect, it } from 'vitest';
import {
  formatLiveStart,
  fromLocalInputValue,
  liveScheduleBounds,
  liveScheduleProblem,
  offeredLiveStart,
  toLocalInputValue,
} from './liveSchedule';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// A moment with seconds in it, so rounding shows.
const NOW = new Date(2026, 10, 3, 10, 7, 30).getTime();

describe('liveScheduleBounds', () => {
  it('runs from the earliest minute allowed to the furthest day allowed', () => {
    const { min, max } = liveScheduleBounds(NOW);
    // Rounded up to the whole minute: never before the earliest.
    expect(min.getTime()).toBeGreaterThanOrEqual(
      NOW + LIVE_SCHEDULE_MIN_MINUTES * MINUTE,
    );
    expect(min.getTime() - NOW).toBeLessThan(
      (LIVE_SCHEDULE_MIN_MINUTES + 1) * MINUTE,
    );
    expect(min.getSeconds()).toBe(0);
    // Rounded down: never after the furthest.
    expect(max.getTime()).toBeLessThanOrEqual(
      NOW + LIVE_SCHEDULE_MAX_DAYS * DAY,
    );
    expect(NOW + LIVE_SCHEDULE_MAX_DAYS * DAY - max.getTime()).toBeLessThan(
      MINUTE,
    );
  });

  it('offers a round time no earlier than the earliest', () => {
    const offered = offeredLiveStart(NOW);
    expect(offered.getTime()).toBeGreaterThanOrEqual(
      liveScheduleBounds(NOW).min.getTime(),
    );
    expect(offered.getMinutes() % 5).toBe(0);
    expect(liveScheduleProblem(offered, NOW)).toBeNull();
  });
});

describe('liveScheduleProblem', () => {
  it('needs a time', () => {
    expect(liveScheduleProblem(null, NOW)).toBe('missing');
  });

  it('refuses a time sooner than the earliest', () => {
    const soon = new Date(NOW + (LIVE_SCHEDULE_MIN_MINUTES * MINUTE - 1));
    expect(liveScheduleProblem(soon, NOW)).toBe('too_soon');
    expect(
      liveScheduleProblem(
        new Date(NOW + LIVE_SCHEDULE_MIN_MINUTES * MINUTE),
        NOW,
      ),
    ).toBeNull();
  });

  it('refuses a time further than the furthest', () => {
    expect(
      liveScheduleProblem(new Date(NOW + LIVE_SCHEDULE_MAX_DAYS * DAY), NOW),
    ).toBeNull();
    expect(
      liveScheduleProblem(
        new Date(NOW + LIVE_SCHEDULE_MAX_DAYS * DAY + 1),
        NOW,
      ),
    ).toBe('too_far');
  });
});

describe('the datetime-local value', () => {
  it('is written and read in the time zone of the device', () => {
    const date = new Date(2026, 0, 5, 9, 4);
    expect(toLocalInputValue(date)).toBe('2026-01-05T09:04');
    expect(fromLocalInputValue('2026-01-05T09:04')?.getTime()).toBe(
      date.getTime(),
    );
  });

  it('is nothing when empty or not a date and time', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('tomorrow')).toBeNull();
  });
});

describe('formatLiveStart', () => {
  it('writes the day and the time in the reader language', () => {
    const start = new Date(2026, 10, 9, 18, 30);
    const en = formatLiveStart(start, 'en', NOW);
    const es = formatLiveStart(start, 'es', NOW);
    expect(en).toMatch(/Nov/);
    expect(en).toMatch(/6:30/);
    expect(es).toMatch(/nov/);
    expect(es).toMatch(/18:30/);
    expect(en).not.toMatch(/2026/);
  });

  it('adds the year when it is not this one', () => {
    expect(formatLiveStart(new Date(2027, 0, 9, 18, 30), 'en', NOW)).toMatch(
      /2027/,
    );
  });
});
