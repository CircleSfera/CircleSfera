// Digital content and services start at once, so a consumer keeps the 14-day
// right of withdrawal unless they consent to that and acknowledge losing it
// before paying (Spanish consumer law, TRLGDCU Art. 103 m). The app shows the
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
