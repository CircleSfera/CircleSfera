import { Logger } from '@nestjs/common';
import type { ModeratedContentType } from '../../common/policies/moderation-decision.js';
import { removalNotice } from '../../notifications/removal-notice.js';

const logger = new Logger('TellAuthorOfRemoval');

/**
 * Tells the author in the app that staff removed their content, once the
 * removal is written. The notice comes from CircleSfera: no member of staff
 * is named. The content stays removed whatever happens to the
 * notice: a failure here is logged, never thrown.
 */
export async function tellAuthorOfRemoval(
  send: (notice: ReturnType<typeof removalNotice>) => unknown,
  removed: {
    kind: ModeratedContentType;
    id: string;
    authorProfileId: string;
    note?: string;
  },
): Promise<void> {
  try {
    await send(removalNotice(removed));
  } catch (err) {
    logger.error(
      `The author of a removed ${removed.kind.toLowerCase()} could not be told: ${err instanceof Error ? err.message : err}`,
    );
  }
}
