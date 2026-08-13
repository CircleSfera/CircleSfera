import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Notification.senderId FKs to User. Prefer the operator's linked platform
 * user; omit sender when the AdminIdentity has no link (system-style notice).
 */
export async function resolveAdminNotificationSenderId(
  prisma: PrismaService,
  adminId: string,
): Promise<string | undefined> {
  const admin = await prisma.adminIdentity.findUnique({
    where: { id: adminId },
    select: { linkedUserId: true },
  });
  return admin?.linkedUserId ?? undefined;
}
