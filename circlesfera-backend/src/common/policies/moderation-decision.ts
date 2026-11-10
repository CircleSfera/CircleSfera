import type { ModerationStatus, Prisma } from '@prisma/client';

type ModerationWriter = Pick<
  Prisma.TransactionClient,
  'post' | 'story' | 'comment'
>;

export type ModeratedContentType = 'POST' | 'STORY' | 'COMMENT';
export type ModerationDecision = Extract<
  ModerationStatus,
  'VISIBLE' | 'HIDDEN' | 'REMOVED'
>;

const SELECT = { id: true, profileId: true, moderationStatus: true } as const;

/**
 * Writes what staff decided about a post, story or comment. Hiding or
 * removing it records when, since the six months to appeal count from then;
 * showing it again clears nothing, so the history stays. Removing never
 * deletes the row: the content is kept, shown to nobody, until its appeal
 * time is over. The note replaces the one before only when there is one.
 */
export function setModerationStatus(
  db: ModerationWriter,
  type: ModeratedContentType,
  id: string,
  status: ModerationDecision,
  note?: string,
): Promise<{
  id: string;
  profileId: string;
  moderationStatus: ModerationStatus;
}> {
  const data = {
    moderationStatus: status,
    moderationNote: note,
    ...(status === 'VISIBLE' ? {} : { moderatedAt: new Date() }),
  };
  const args = { where: { id }, data, select: SELECT };
  // A post or story staff decide to show has been looked at by a person:
  // it may be sold or tipped as if automatic moderation had passed it.
  const cleared =
    status === 'VISIBLE'
      ? {
          ...args,
          data: {
            ...data,
            moderationPassedAt: new Date(),
            moderationPassedByStaff: true,
          },
        }
      : args;
  if (type === 'POST') return db.post.update(cleared);
  if (type === 'STORY') return db.story.update(cleared);
  return db.comment.update(args);
}
