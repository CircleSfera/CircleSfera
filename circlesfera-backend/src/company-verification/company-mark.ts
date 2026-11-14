import { CompanyVerificationStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { hasTeamPlan } from '../team/team-plan.js';

// Whether a Profile shows "Verified company": a Business Profile on the
// Business plan with an approved verification. Without the plan the mark
// is hidden and the verification kept; it shows again when the plan
// returns.
export async function isVerifiedCompany(
  prisma: Pick<PrismaService, 'companyVerification'>,
  profile: { id: string; accountType: string; verificationLevel: string },
): Promise<boolean> {
  if (!hasTeamPlan(profile)) return false;
  const approved = await prisma.companyVerification.count({
    where: {
      profileId: profile.id,
      status: CompanyVerificationStatus.APPROVED,
    },
  });
  return approved > 0;
}
