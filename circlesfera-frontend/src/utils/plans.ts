/**
 * What a platform plan adds, read from the level the plan gives a profile.
 * The server enforces each of these; the app uses them to show the right
 * thing instead of a refusal.
 */
export function hasElitePlan(verificationLevel: string | null | undefined) {
  return verificationLevel === 'ELITE' || verificationLevel === 'BUSINESS';
}

export type ProfileAccountKind = 'PERSONAL' | 'CREATOR' | 'BUSINESS';

/**
 * The type of profile a plan is for, from its name: Business for business
 * profiles, Elite Creator for creator profiles, Premium for any. The server
 * refuses the others at checkout; the pricing page says so beforehand.
 */
export function planAccountType(planName: string): ProfileAccountKind | null {
  const name = planName.toLowerCase();
  if (name.includes('business')) return 'BUSINESS';
  if (name.includes('elite')) return 'CREATOR';
  return null;
}

/** Whether a profile of that type can buy the plan. */
export function planFitsProfile(
  planName: string,
  accountType: ProfileAccountKind | null | undefined,
): boolean {
  const required = planAccountType(planName);
  return !required || required === accountType;
}
