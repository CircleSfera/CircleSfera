import type { LiveAudience } from '../enums/live-audience.js';

/** The furthest ahead a live can be scheduled, in days. */
export const LIVE_SCHEDULE_MAX_DAYS = 90;

/** The earliest a scheduled live can start, in minutes from now. */
export const LIVE_SCHEDULE_MIN_MINUTES = 15;

/** The most upcoming scheduled lives a host has at once. */
export const LIVE_SCHEDULED_MAX = 5;

/** How long before a scheduled live starts its reminders are sent, in minutes. */
export const LIVE_REMINDER_LEAD_MINUTES = 15;

/**
 * How long after its time a scheduled live waits for its host, in minutes,
 * before it is missed.
 */
export const LIVE_SCHEDULE_GRACE_MINUTES = 60;

/** Who a scheduled live can be for: a practice is never scheduled. */
export const LIVE_SCHEDULE_AUDIENCES = [
  'EVERYONE',
  'CLOSE_FRIENDS',
] as const satisfies readonly LiveAudience[];
export type LiveScheduleAudience = (typeof LIVE_SCHEDULE_AUDIENCES)[number];

/**
 * Where a scheduled live is: waiting for its time, started as a live,
 * cancelled by its host, or missed because its host never went live.
 */
export const SCHEDULED_LIVE_STATUSES = [
  'SCHEDULED',
  'STARTED',
  'CANCELLED',
  'MISSED',
] as const;
export type ScheduledLiveStatus = (typeof SCHEDULED_LIVE_STATUSES)[number];
