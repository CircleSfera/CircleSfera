/**
 * How a person's ads are chosen (PD-084; Notion → Product → Product
 * Specifications → Advertising: Pixel, Conversions and Audiences, section 3).
 *
 * - PERSONALISED: with their activity on advertisers' websites and apps
 *   (Pixel and Conversions API), and advertisers' audiences may include them.
 * - GENERAL: only by context (the topic of what they are watching, city,
 *   language, time) and the interests they choose.
 *
 * Accepting the Terms is not this consent: it is asked apart, never
 * pre-selected, and withdrawn as easily as it is given.
 */
export const AD_CHOICES = ['PERSONALISED', 'GENERAL'] as const;
export type AdChoice = (typeof AD_CHOICES)[number];

/** Where the person answered: the screen after sign-up or on next open, or Settings → Ads. */
export const AD_CONSENT_SOURCES = ['PROMPT', 'SETTINGS'] as const;
export type AdConsentSource = (typeof AD_CONSENT_SOURCES)[number];

/**
 * The version of the texts the screen shows, stored with every answer as
 * proof of what the person saw. It is the date the owner decided them; it
 * changes whenever the texts change, and then the person is asked again
 * (after a "no", not before AD_CONSENT_NO_REASK_MONTHS).
 */
export const AD_CONSENT_TEXT_VERSION = '2026-11-22';

/** After a "no", the screen is not shown again for at least this long. */
export const AD_CONSENT_NO_REASK_MONTHS = 6;

/**
 * Personalised advertising is never used for anyone younger: the screen is
 * not shown and the answer is always GENERAL.
 */
export const AD_PERSONALISATION_MIN_AGE = 18;

/**
 * The feature flag (Admin → Experiments) that shows the screen and
 * Settings → Ads. Off until the legal review (Ads 0) is done; while it is
 * off nothing is shown to anyone. The server rules apply either way.
 */
export const ADS_CONSENT_FLAG = 'ads_consent';

/** What GET /users/me/ads-consent answers. */
export interface AdConsentStatus {
  /** The last answer the person gave, or null when they never answered. */
  choice: AdChoice | null;
  /** When that answer was given (ISO 8601), or null. */
  decidedAt: string | null;
  /** The version of the texts shown when they answered, or null. */
  textVersion: string | null;
  /** The version of the texts the screen must show now. */
  currentTextVersion: string;
  /** False under AD_PERSONALISATION_MIN_AGE: only GENERAL may apply. */
  personalisationAllowed: boolean;
  /**
   * What applies now: PERSONALISED only for an adult whose last answer was
   * PERSONALISED to the current texts; GENERAL otherwise.
   */
  effectiveChoice: AdChoice;
  /** Whether the app must show the screen now. Never while the flag is off. */
  askNow: boolean;
}
