import type { PrismaService } from '../../prisma/prisma.service.js';

const primaryProfileSelect = {
  select: { id: true },
  take: 1,
  orderBy: { createdAt: 'asc' as const },
};

/**
 * Notification.senderId and Report.reporterId FK to Profile.
 * Resolve the operator's linked platform user → primary profile.
 * Omit sender when the AdminIdentity has no link or that user has no profile.
 */
export async function resolveAdminNotificationSenderId(
  prisma: PrismaService,
  adminId: string,
): Promise<string | undefined> {
  const admin = await prisma.adminIdentity.findUnique({
    where: { id: adminId },
    select: {
      linkedUser: {
        select: { profiles: primaryProfileSelect },
      },
    },
  });
  return admin?.linkedUser?.profiles[0]?.id;
}

/** First ACTIVE panel operator with a social profile — used by automated moderation. */
export async function resolveSystemModeratorActor(
  prisma: PrismaService,
): Promise<{ userId: string; profileId: string } | undefined> {
  const user = await prisma.user.findFirst({
    where: { linkedAdminIdentities: { some: { status: 'ACTIVE' } } },
    select: {
      id: true,
      profiles: primaryProfileSelect,
    },
  });
  const profileId = user?.profiles[0]?.id;
  if (!user || !profileId) return undefined;
  return { userId: user.id, profileId };
}
