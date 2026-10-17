/**
 * The features a platform plan can include. A plan stores the keys of the
 * ones it includes; the code only acts on the keys listed here.
 * `team_access` is only shown: the team follows the Business plan itself
 * (PD-014), so it belongs on the Business plan alone.
 */
export const PLAN_FEATURE_KEYS = [
  'verified_badge',
  'no_promoted_content',
  'advanced_analytics',
  'team_access',
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];
