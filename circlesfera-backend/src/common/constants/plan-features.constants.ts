import { SubscriptionStatus } from '@prisma/client';

/**
 * The features a platform plan can include, in the order the pricing page
 * lists them. A plan stores the keys of the ones it includes, and staff can
 * only save keys listed here.
 * - `priority_support`: the support queue answers a requester on a paid
 *   plan first.
 * - `team_access` is only shown: the team follows the Business plan itself,
 *   so it belongs on the Business plan alone.
 * - `studio_pro`: the Edits Studio's Pro features, for the Profile with it.
 * - `no_promoted_content` and `profile_colour` follow the plan's features,
 *   not its badge, so Premium (a verified badge) carries them (PD-088).
 */
export const PLAN_FEATURE_KEYS = [
  'verified_badge',
  'priority_support',
  'no_promoted_content',
  'profile_colour',
  'advanced_analytics',
  'team_access',
  'studio_pro',
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

/**
 * The states of a subscription that give what its plan includes. A renewal
 * that failed (PAST_DUE) keeps them while the payment provider tries the
 * card again, as most services do; once it stops trying (UNPAID) or the
 * subscription ends, they stop.
 */
export const ENTITLED_STATUSES = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.PAST_DUE,
] as const;

export function isEntitled(status: SubscriptionStatus): boolean {
  return (ENTITLED_STATUSES as readonly SubscriptionStatus[]).includes(status);
}
