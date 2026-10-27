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
  if (type === 'POST') return db.post.update(args);
  if (type === 'STORY') return db.story.update(args);
  return db.comment.update(args);
}
