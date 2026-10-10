/**
 * The features a platform plan can include. A plan stores the keys of the
 * ones it includes; the code only acts on the keys listed here.
 */
export const PLAN_FEATURE_KEYS = [
  'verified_badge',
  'no_promoted_content',
  'advanced_analytics',
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];
