import type { PrismaService } from '../prisma/prisma.service.js';

type PlanOf = { accountType: string; verificationLevel: string };

// A team is part of the Business plan on a Business Profile (PD-014).
export const hasTeamPlan = (profile: PlanOf | null | undefined): boolean =>
  profile?.accountType === 'BUSINESS' &&
  profile.verificationLevel === 'BUSINESS';

// The members of a Profile follow its plan (PD-014): when the Business plan
// ends, or the Profile stops being a Business Profile, they are paused, not
// removed; when the plan returns they are active again. Called wherever the
// plan or the kind of a Profile changes. It only moves members between the
// two states, so calling it with nothing changed does nothing.
export async function followTeamPlan(
  prisma: Pick<PrismaService, 'profile' | 'profileMember'>,
  profileId: string,
): Promise<number> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { accountType: true, verificationLevel: true },
  });
  if (!profile) return 0;
  const onPlan = hasTeamPlan(profile);
  const moved = await prisma.profileMember.updateMany({
    where: { profileId, status: onPlan ? 'PAUSED' : 'ACTIVE' },
    data: { status: onPlan ? 'ACTIVE' : 'PAUSED' },
  });
  return moved.count;
}
