import type { VerificationLevel } from '@prisma/client';

// The colours a Profile can choose for its page. A closed list: each one
// reads well on the dark background, and coral is left out because it marks
// destructive actions. No choice means the colour of the app.
export const PROFILE_ACCENT_COLORS = [
  'blue',
  'cyan',
  'teal',
  'green',
  'amber',
  'pink',
  'silver',
] as const;

export type ProfileAccentColor = (typeof PROFILE_ACCENT_COLORS)[number];

// How many Profiles one person can have. The Business plan raises it.
export const PROFILE_LIMIT = 5;
export const BUSINESS_PROFILE_LIMIT = 10;

// Personalization of the Profile page comes with the Elite Creator and
// Business plans.
export function canPersonalizeProfile(
  level: VerificationLevel | null | undefined,
): boolean {
  return level === 'ELITE' || level === 'BUSINESS';
}
