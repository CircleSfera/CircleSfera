// A post, story or comment removed by moderation is kept for the six months
// its author has to appeal, and shown to nobody in that time, its author
// included: every list, count and lookup outside the staff panel leaves it
// out. Staff views still list it. A post (frame included) or story its author
// deleted is left out the same way: it waits 30 days in their Recently
// deleted, the only place it is shown, then it is erased. For posts and
// stories only: a comment has no deletedAt.
export const NOT_REMOVED = {
  moderationStatus: { not: 'REMOVED' as const },
  deletedAt: null,
};

// A post (frame included) its author archived is shown in their archive
// only, with its likes and comments: every list, count and lookup that
// leaves out removed and deleted posts leaves it out too, for everyone, its
// author included. Stories have no such state: each one is in its author's
// archive once its 24 hours end.
export const LISTED_POST = { ...NOT_REMOVED, archivedAt: null };

// The moderation states a comment is listed in, for everyone.
export const SHOWN_COMMENT_STATUSES = {
  in: ['VISIBLE', 'FLAGGED'] as Array<'VISIBLE' | 'FLAGGED'>,
};

// The comments a post's list shows: the comments on it and the replies to
// them, each in a shown state, a reply only under a shown comment.
export const SHOWN_COMMENT = {
  moderationStatus: SHOWN_COMMENT_STATUSES,
  OR: [
    { parentId: null },
    { parent: { parentId: null, moderationStatus: SHOWN_COMMENT_STATUSES } },
  ],
};

// A post's comment count counts what its list shows.
export const SHOWN_COMMENTS_COUNT = { where: SHOWN_COMMENT };

export function isRemoved(content: {
  moderationStatus?: string | null;
}): boolean {
  return content.moderationStatus === 'REMOVED';
}

// Whether a post or story is out of everyone's sight: removed by moderation,
// or deleted by its author and waiting in their Recently deleted.
export function isGone(content: {
  moderationStatus?: string | null;
  deletedAt?: Date | null;
}): boolean {
  return isRemoved(content) || !!content.deletedAt;
}

// Whether a post is out of everyone's sight but its author's archive: gone,
// or archived by its author.
export function isUnlisted(post: {
  moderationStatus?: string | null;
  deletedAt?: Date | null;
  archivedAt?: Date | null;
}): boolean {
  return isGone(post) || !!post.archivedAt;
}
