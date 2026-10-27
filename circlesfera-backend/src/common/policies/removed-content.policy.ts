// A post, story or comment removed by moderation is kept for the six months
// its author has to appeal, and shown to nobody in that time, its author
// included: every list, count and lookup outside the staff panel leaves it
// out. Staff views still list it.
export const NOT_REMOVED = {
  moderationStatus: { not: 'REMOVED' as const },
};

// Counts of a post's comments leave out the removed ones.
export const SHOWN_COMMENTS_COUNT = { where: NOT_REMOVED };

export function isRemoved(content: {
  moderationStatus?: string | null;
}): boolean {
  return content.moderationStatus === 'REMOVED';
}
