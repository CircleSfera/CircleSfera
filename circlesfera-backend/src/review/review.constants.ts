// The review area: what an external reviewer (a payment provider) reads to
// check the money that moves here and how the rules are enforced. It shows
// no one's email, IP address, messages, notes or payment details.

// How many rows a page holds, by default and at most.
export const REVIEW_PAGE_DEFAULT = 20;
export const REVIEW_PAGE_MAX = 50;

// How far back the summary counts.
export const REVIEW_SUMMARY_DAYS = 30;

export const REVIEW_ENFORCEMENT_KINDS = [
  'reports',
  'strikes',
  'appeals',
  'notices',
] as const;
export type ReviewEnforcementKind = (typeof REVIEW_ENFORCEMENT_KINDS)[number];
