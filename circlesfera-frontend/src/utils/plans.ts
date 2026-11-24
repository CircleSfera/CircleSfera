/**
 * What a platform plan adds, read from the level the plan gives a profile.
 * The server enforces each of these; the app uses them to show the right
 * thing instead of a refusal.
 */
export function hasElitePlan(verificationLevel: string | null | undefined) {
  return verificationLevel === 'ELITE' || verificationLevel === 'BUSINESS';
}

export type ProfileAccountKind = 'PERSONAL' | 'CREATOR' | 'BUSINESS';

// What the pricing pages read of a plan to know what it is and for whom: the
// fields the plan catalog sets, never the plan's name.
type PlanKind = {
  forAccountType?: ProfileAccountKind | null;
  addOn?: boolean;
};

/**
 * Whether a profile of that type can buy the plan: a plan for one type of
 * profile (Elite Creator for creators, Business for businesses) only for
 * it, the others for any. The server refuses the others at checkout; the
 * pricing page says so beforehand.
 */
export function planFitsProfile(
  plan: PlanKind,
  accountType: ProfileAccountKind | null | undefined,
): boolean {
  return !plan.forAccountType || plan.forAccountType === accountType;
}

/**
 * Edits Studio Pro is an add-on, held beside the Verified or Premium plan;
 * Elite Creator and Business include it.
 */
export function isAddOnPlan(plan: PlanKind | null | undefined): boolean {
  return plan?.addOn === true;
}

type StudioProBilling = {
  studioPro?: {
    includedInPlan?: boolean;
    subscription?: { status?: string } | null;
  };
} | null;

/**
 * Where the Profile in use stands with Edits Studio Pro, from its billing
 * status: holding the add-on, having it with its plan, or neither.
 */
export function studioProState(
  billing: StudioProBilling | undefined,
): 'held' | 'included' | 'none' {
  const status = billing?.studioPro?.subscription?.status;
  // A renewal that failed is still the add-on, being tried again or left
  // unpaid: paid, not bought again.
  if (
    status === 'ACTIVE' ||
    status === 'TRIALING' ||
    status === 'PAST_DUE' ||
    status === 'UNPAID'
  )
    return 'held';
  if (billing?.studioPro?.includedInPlan) return 'included';
  return 'none';
}
