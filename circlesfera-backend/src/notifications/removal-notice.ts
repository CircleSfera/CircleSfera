import { $Enums } from '@prisma/client';
import type { ModeratedContentType } from '../common/policies/moderation-decision.js';

// What a notice about removed content is about, as the app reads it: a
// removed post (or frame) can be appealed, a story or comment cannot.
export const REMOVAL_TARGET_TYPES = {
  POST: 'post_removed',
  STORY: 'story_removed',
  COMMENT: 'comment_removed',
} as const satisfies Record<ModeratedContentType, string>;

/**
 * The notice that tells the author staff removed their post, frame, story or
 * comment, and why: the staff note, or else the generic reason in the
 * author's language. A post carries its id, which the app opens the appeal
 * form with; the server checks again who may appeal it.
 */
export function removalNotice(input: {
  kind: ModeratedContentType;
  id: string;
  authorProfileId: string;
  senderId?: string;
  note?: string;
}) {
  return {
    recipientId: input.authorProfileId,
    senderId: input.senderId,
    type: $Enums.NotificationType.MODERATION,
    notice: {
      key: 'content_moderated' as const,
      contentType: input.kind,
      status: 'removed' as const,
      note: input.note,
    },
    postId: input.kind === 'POST' ? input.id : undefined,
    targetType: REMOVAL_TARGET_TYPES[input.kind],
    targetId: input.id,
  };
}
