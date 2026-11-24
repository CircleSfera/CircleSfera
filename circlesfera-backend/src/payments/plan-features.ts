import {
  ENTITLED_STATUSES,
  type PlanFeatureKey,
} from '../common/constants/plan-features.constants.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * The features the plans of one Profile give now: its plans and add-ons that
 * still give them (ENTITLED_STATUSES: a renewal being tried again included).
 * A plan of another Profile of the same person does not count, and a session
 * without a Profile has none. A benefit follows these features, never the
 * badge, so Premium (a verified badge) can carry what Elite Creator has
 * (PD-088).
 */
export async function profilePlanFeatures(
  prisma: Pick<PrismaService, 'platformSubscription'>,
  profileId: string | null | undefined,
): Promise<Set<PlanFeatureKey>> {
  if (!profileId) return new Set();
  const subscriptions = await prisma.platformSubscription.findMany({
    where: { profileId, status: { in: [...ENTITLED_STATUSES] } },
    select: { plan: { select: { features: true } } },
  });
  return new Set(
    subscriptions.flatMap(
      (subscription) => (subscription.plan?.features ?? []) as PlanFeatureKey[],
    ),
  );
}
