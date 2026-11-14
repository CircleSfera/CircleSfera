/**
 * The features a platform plan can include, in the order the pricing page
 * lists them. A plan stores the keys of the ones it includes, and staff can
 * only save keys listed here.
 * - `priority_support`: the support queue answers a requester on a paid
 *   plan first.
 * - `team_access` is only shown: the team follows the Business plan itself,
 *   so it belongs on the Business plan alone.
 * - `studio_pro`: the Edits Studio's Pro features, for the Profile with it.
 */
export const PLAN_FEATURE_KEYS = [
  'verified_badge',
  'priority_support',
  'no_promoted_content',
  'advanced_analytics',
  'team_access',
  'studio_pro',
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

/**
 * Edits Studio Pro is an add-on: a Profile may hold it beside its plan
 * (Verified or Premium). The plans that include `studio_pro` already give
 * it, so it is not bought on top of them.
 */
export const STUDIO_PRO_PLAN_NAME = 'Edits Studio Pro';

export function isAddOnPlan(planName: string | null | undefined): boolean {
  return planName === STUDIO_PRO_PLAN_NAME;
}
