// Digital content (a promotion) starts at once, so a consumer keeps the
// 14-day right of withdrawal unless they consent to that and acknowledge
// losing it before paying (Spanish consumer law, TRLGDCU Art. 103 m). The app shows the
// box; the purchase routes refuse a body without it; and the consent, with
// the version of the wording accepted, goes into the metadata of the Stripe
// Checkout Session, kept with the payment. The session's own creation time
// is when it was given. No time is written here: a retried request with the
// same idempotency key must send the same parameters.

// Which wording was accepted; it changes when counsel changes the text.
export const WITHDRAWAL_CONSENT_VERSION = '2026-1';

export function withdrawalConsentMetadata(): Record<string, string> {
  return {
    withdrawal_consent: 'accepted',
    withdrawal_consent_version: WITHDRAWAL_CONSENT_VERSION,
  };
}

// A Platform Plan (and the Edits Studio Pro add-on) is a service: the buyer
// asks for it to start at once and keeps the 14-day right of withdrawal,
// accepting that a withdrawal within those days pays for the part already
// used (TRLGDCU Art. 108; owner decision PD-023). Its own wording and version,
// kept apart from the promotion's above. The request field stays
// `withdrawalConsent`, so the API does not change.
export const PLAN_START_CONSENT_VERSION = '2026-2';

export function planStartConsentMetadata(): Record<string, string> {
  return {
    plan_start_consent: 'accepted',
    plan_start_consent_version: PLAN_START_CONSENT_VERSION,
  };
}

// The free year of Verified of a founding creator (BD-034): the person
// accepts its terms before it starts (that nothing is charged during the
// year; that at its end, with a card saved, it continues at the monthly
// price, VAT included, until cancelled, and without one it ends). The
// wording is the owner's of 2026-11-25. Its version and the moment it was
// accepted go into the subscription's metadata at the provider and onto
// the application.
export const FREE_YEAR_CONSENT_VERSION = '2026-11-25';

export function freeYearConsentMetadata(
  acceptedAt: Date,
): Record<string, string> {
  return {
    free_year_consent: 'accepted',
    free_year_consent_version: FREE_YEAR_CONSENT_VERSION,
    free_year_consent_at: acceptedAt.toISOString(),
  };
}

// The 14 days to withdraw from a plan, counted from its purchase.
export const WITHDRAWAL_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;

// The last moment a plan bought at `purchasedAt` can be withdrawn from.
export function withdrawalDeadline(purchasedAt: Date): Date {
  return new Date(purchasedAt.getTime() + WITHDRAWAL_PERIOD_MS);
}
