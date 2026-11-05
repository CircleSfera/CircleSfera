// An external reviewer is someone outside CircleSfera, such as the payment
// provider, who checks what is sold here and how the rules are enforced. They
// sign in to the staff panel with a staff identity that holds this one role
// and nothing else, read the review area only and never change anything.
//
// Their sign-in asks for no authenticator: the owner chose so, because the
// reviewer cannot be given a member of staff's second factor. What keeps it
// safe instead: the identity lasts only until a date, a session lasts at most
// a working day from its sign-in and is never renewed past it, the role reads
// nothing but the review area, and every page it opens is written down.

export const EXTERNAL_REVIEWER_ROLE = 'EXTERNAL_REVIEWER';
export const EXTERNAL_REVIEWER_ROLE_ID = 'arole_external_reviewer';

// How long a reviewer's access lasts when it is given, and the longest it may
// be given for at once; it can be extended again.
export const REVIEWER_ACCESS_DEFAULT_DAYS = 30;
export const REVIEWER_ACCESS_MAX_DAYS = 90;

// The longest a reviewer's session lasts from its sign-in, renewals included.
export const REVIEWER_SESSION_MAX_MS = 8 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

// Whether a staff identity is an external reviewer: the role alone.
export function isExternalReviewer(roles: readonly string[]): boolean {
  return roles.length === 1 && roles[0] === EXTERNAL_REVIEWER_ROLE;
}

// Whether an identity's access has run out at a moment.
export function accessHasExpired(
  accessExpiresAt: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  return !!accessExpiresAt && accessExpiresAt.getTime() <= now;
}

// The end of a reviewer's access given for a number of days from a moment.
export function reviewerAccessEnd(
  days: number = REVIEWER_ACCESS_DEFAULT_DAYS,
  now: number = Date.now(),
): Date {
  return new Date(now + days * DAY_MS);
}

// The latest a reviewer's access may end if given now.
export function reviewerAccessLatestEnd(now: number = Date.now()): Date {
  return reviewerAccessEnd(REVIEWER_ACCESS_MAX_DAYS, now);
}
