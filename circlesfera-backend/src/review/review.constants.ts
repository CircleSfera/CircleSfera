// The review area: what an external reviewer (a payment provider) reads to
// check what is sold here and how the rules are enforced. It names creators
// by their public username only and shows no one's email, IP address,
// messages, notes or payment details.

// How many rows a page holds, by default and at most.
export const REVIEW_PAGE_DEFAULT = 20;
export const REVIEW_PAGE_MAX = 50;

// How far back the summary counts.
export const REVIEW_SUMMARY_DAYS = 30;

export const REVIEW_PAID_KINDS = ['post', 'story'] as const;
export type ReviewPaidKind = (typeof REVIEW_PAID_KINDS)[number];

export const REVIEW_ENFORCEMENT_KINDS = [
  'reports',
  'strikes',
  'appeals',
  'notices',
] as const;
export type ReviewEnforcementKind = (typeof REVIEW_ENFORCEMENT_KINDS)[number];

// The moderation states in which content is shown, and so may be sold.
export const SHOWN_STATUSES = { in: ['VISIBLE', 'FLAGGED'] } as {
  in: Array<'VISIBLE' | 'FLAGGED'>;
};

// A paid post or story on sale now: shown, not deleted, a post not archived.
export const POST_ON_SALE = {
  isPremium: true,
  moderationStatus: SHOWN_STATUSES,
  deletedAt: null,
  archivedAt: null,
};
export const STORY_ON_SALE = {
  isPremium: true,
  moderationStatus: SHOWN_STATUSES,
  deletedAt: null,
};

// The accounts that may charge for their content.
export const CHARGING_ACCOUNT_TYPES = ['CREATOR', 'BUSINESS'] as Array<
  'CREATOR' | 'BUSINESS'
>;
