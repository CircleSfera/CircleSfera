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

// The Profile colour comes with a plan whose features include it (Premium,
// Elite Creator and Business; PD-013, PD-088).
export function canPersonalizeProfile(features: ReadonlySet<string>): boolean {
  return features.has('profile_colour');
}
