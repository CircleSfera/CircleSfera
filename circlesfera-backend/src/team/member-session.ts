import type { ProfileMemberRole } from '@prisma/client';
import {
  pickSessionProfile,
  SESSION_PROFILE_ORDER,
  SESSION_PROFILE_SELECT,
  type SessionProfileCandidate,
} from '../auth/services/session-profile.util.js';
import type { PrismaService } from '../prisma/prisma.service.js';

type SessionProfile = SessionProfileCandidate & { id: string };

// The Profile a session acts as, and, when it is a Profile the person works
// on as a team member, their role (ADR-0028). A session bound to a Profile of
// someone else counts only while the person is an active member of it;
// otherwise it falls back to the person's own Profiles, as before.
export async function resolveSessionProfile(
  prisma: Pick<PrismaService, 'profile' | 'profileMember'>,
  userId: string,
  boundProfileId?: string | null,
): Promise<{
  profile: SessionProfile | undefined;
  memberRole?: ProfileMemberRole;
}> {
  const own = await prisma.profile.findMany({
    where: { userId },
    orderBy: SESSION_PROFILE_ORDER,
    select: SESSION_PROFILE_SELECT,
  });
  if (boundProfileId && !own.some((p) => p.id === boundProfileId)) {
    const membership = await prisma.profileMember.findUnique({
      where: { profileId_userId: { profileId: boundProfileId, userId } },
      select: {
        status: true,
        role: true,
        profile: { select: SESSION_PROFILE_SELECT },
      },
    });
    if (membership?.status === 'ACTIVE') {
      return { profile: membership.profile, memberRole: membership.role };
    }
  }
  return { profile: pickSessionProfile(own, boundProfileId) };
}
