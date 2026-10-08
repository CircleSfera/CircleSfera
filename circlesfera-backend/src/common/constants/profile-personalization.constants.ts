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

// Personalization of the Profile page comes with the Elite Creator and
// Business plans.
export function canPersonalizeProfile(
  level: VerificationLevel | null | undefined,
): boolean {
  return level === 'ELITE' || level === 'BUSINESS';
}
