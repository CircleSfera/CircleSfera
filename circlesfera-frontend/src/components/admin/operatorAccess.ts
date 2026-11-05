import {
  EXTERNAL_REVIEWER_ROLE_ID,
  REVIEWER_ACCESS_DEFAULT_DAYS,
  REVIEWER_ACCESS_MAX_DAYS,
} from '@circlesfera/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

// Whether a set of roles makes an external reviewer: that role alone.
export function isReviewerRoleSet(roleIds: readonly string[]): boolean {
  return roleIds.length === 1 && roleIds[0] === EXTERNAL_REVIEWER_ROLE_ID;
}

// The roles after one is switched. The reviewer role is never held with
// another: choosing it leaves it alone, choosing another drops it. The last
// role is never switched off.
export function switchRole(
  selected: readonly string[],
  roleId: string,
): string[] {
  if (selected.includes(roleId)) {
    const next = selected.filter((id) => id !== roleId);
    return next.length ? next : [...selected];
  }
  if (roleId === EXTERNAL_REVIEWER_ROLE_ID) return [roleId];
  return [...selected.filter((id) => id !== EXTERNAL_REVIEWER_ROLE_ID), roleId];
}

// A day as a date field holds it (YYYY-MM-DD, in local time).
export function toDateField(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The days a reviewer's access may end on, from now: tomorrow at the
// earliest, the longest a reviewer is given at the latest, and by default
// the usual length.
export function reviewerAccessDays(now: number = Date.now()) {
  return {
    min: toDateField(new Date(now + DAY_MS)),
    max: toDateField(new Date(now + REVIEWER_ACCESS_MAX_DAYS * DAY_MS)),
    initial: toDateField(new Date(now + REVIEWER_ACCESS_DEFAULT_DAYS * DAY_MS)),
  };
}

// The moment access ends for a day chosen: the start of that day, local
// time, so it lasts up to the day chosen and never past the longest allowed.
export function accessEndOf(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
