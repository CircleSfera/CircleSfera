import { Logger } from '@nestjs/common';
import type { ModeratedContentType } from '../../common/policies/moderation-decision.js';
import { removalNotice } from '../../notifications/removal-notice.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { resolveAdminNotificationSenderId } from './resolve-admin-notification-sender.js';

const logger = new Logger('TellAuthorOfRemoval');

/**
 * Tells the author in the app that staff removed their content, once the
 * removal is written. The content stays removed whatever happens to the
 * notice: a failure here is logged, never thrown.
 */
export async function tellAuthorOfRemoval(
  prisma: PrismaService,
  send: (notice: ReturnType<typeof removalNotice>) => unknown,
  adminId: string,
  removed: {
    kind: ModeratedContentType;
    id: string;
    authorProfileId: string;
    note?: string;
  },
): Promise<void> {
  try {
    const senderId = await resolveAdminNotificationSenderId(prisma, adminId);
    await send(removalNotice({ ...removed, senderId }));
  } catch (err) {
    logger.error(
      `The author of a removed ${removed.kind.toLowerCase()} could not be told: ${err instanceof Error ? err.message : err}`,
    );
  }
}
