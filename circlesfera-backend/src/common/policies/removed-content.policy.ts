// A post, story or comment removed by moderation is kept for the six months
// its author has to appeal, and shown to nobody in that time, its author
// included: every list, count and lookup outside the staff panel leaves it
// out. Staff views still list it.
export const NOT_REMOVED = {
  moderationStatus: { not: 'REMOVED' as const },
};

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
