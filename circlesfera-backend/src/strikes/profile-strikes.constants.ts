import type { Prisma } from '@prisma/client';

// Moderation strike policy for Profiles (owner decision):
// - a first minor violation gets a warning with no consequence;
// - every later violation is a strike;
// - the second active strike suspends the Profile for 7 days;
// - the third active strike bans the Profile (the account's other Profiles
//   are not affected);
// - warnings and strikes expire 90 days after they are applied, each one on
//   its own date;
// - an approved appeal withdraws the strike it is about.
// Severe violations skip this ladder: staff ban the Profile directly.

export const STRIKE_EXPIRY_DAYS = 90;
export const STRIKES_TO_SUSPEND = 2;
export const STRIKES_TO_BAN = 3;
export const STRIKE_SUSPENSION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function strikeExpiresAt(appliedAt: Date): Date {
  return new Date(appliedAt.getTime() + STRIKE_EXPIRY_DAYS * DAY_MS);
}

export function suspensionEndsAt(appliedAt: Date): Date {
  return new Date(appliedAt.getTime() + STRIKE_SUSPENSION_DAYS * DAY_MS);
}

// Records that still count: not withdrawn by an appeal and not expired.
export function activeStrikeRecordWhere(
  now: Date = new Date(),
): Prisma.ProfileStrikeWhereInput {
  return { revokedAt: null, expiresAt: { gt: now } };
}

// Active strikes only; warnings never count towards a suspension or a ban.
export function activeStrikeWhere(
  now: Date = new Date(),
): Prisma.ProfileStrikeWhereInput {
  return { ...activeStrikeRecordWhere(now), kind: 'STRIKE' };
}
