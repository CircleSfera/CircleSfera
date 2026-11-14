import { CompanyVerificationStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { hasTeamPlan } from '../team/team-plan.js';

type Details = { legalName: string; taxId: string; domain: string | null };

const sameCompany = (a: Details, b: Details) =>
  a.legalName === b.legalName &&
  a.taxId === b.taxId &&
  (a.domain ?? null) === (b.domain ?? null);

// Whether a Profile shows "Verified company": a Business Profile on the
// Business plan with an approved verification. Without the plan the mark
// is hidden and the verification kept; it shows again when the plan
// returns. While an application with another legal name, tax ID or domain
// waits for staff, the mark is hidden too; it comes back if that
// application is rejected or withdrawn, and only its approval replaces the
// earlier one.
export async function isVerifiedCompany(
  prisma: Pick<PrismaService, 'companyVerification'>,
  profile: { id: string; accountType: string; verificationLevel: string },
): Promise<boolean> {
  if (!hasTeamPlan(profile)) return false;
  const select = { legalName: true, taxId: true, domain: true };
  const [approved, pending] = await Promise.all([
    prisma.companyVerification.findFirst({
      where: {
        profileId: profile.id,
        status: CompanyVerificationStatus.APPROVED,
      },
      orderBy: { decidedAt: 'desc' },
      select,
    }),
    prisma.companyVerification.findFirst({
      where: {
        profileId: profile.id,
        status: CompanyVerificationStatus.PENDING,
      },
      select,
    }),
  ]);
  if (!approved) return false;
  return !pending || sameCompany(approved, pending);
}
