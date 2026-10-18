/**
 * The features a platform plan can include, in the order the pricing page
 * lists them. A plan stores the keys of the ones it includes, and staff can
 * only save keys listed here.
 * - `priority_support`: the support queue answers a requester on a paid
 *   plan first.
 * - `team_access` is only shown: the team follows the Business plan itself,
 *   so it belongs on the Business plan alone.
 */
export const PLAN_FEATURE_KEYS = [
  'verified_badge',
  'priority_support',
  'no_promoted_content',
  'advanced_analytics',
  'team_access',
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];
