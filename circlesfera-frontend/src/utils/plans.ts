/**
 * What a platform plan adds, read from the level the plan gives a profile.
 * The server enforces each of these; the app uses them to show the right
 * thing instead of a refusal.
 */
export function hasElitePlan(verificationLevel: string | null | undefined) {
  return verificationLevel === 'ELITE' || verificationLevel === 'BUSINESS';
}
