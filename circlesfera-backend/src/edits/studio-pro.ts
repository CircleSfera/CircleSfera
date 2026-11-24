import { ENTITLED_STATUSES } from '../common/constants/plan-features.constants.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Whether a Profile has the Edits Studio's Pro features: a plan or add-on of
 * this Profile that includes them (Edits Studio Pro, Elite Creator,
 * Business) and still gives them (ENTITLED_STATUSES: a renewal being tried
 * again included). A plan of another Profile of the same person does not
 * count, and a session without a Profile has none.
 */
export async function hasStudioPro(
  prisma: PrismaService,
  profileId: string | null | undefined,
): Promise<boolean> {
  if (!profileId) return false;
  const count = await prisma.platformSubscription.count({
    where: {
      profileId,
      status: { in: [...ENTITLED_STATUSES] },
      plan: { features: { has: 'studio_pro' } },
    },
  });
  return count > 0;
}
