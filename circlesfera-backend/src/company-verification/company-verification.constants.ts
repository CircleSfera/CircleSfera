// The values of company verification, in one place.

// The VIES REST service of the European Commission: GET <base>/<number>
// answers whether a Spanish VAT number is registered for trade in the EU.
export const VIES_ES_URL =
  'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/ES/vat';
export const VIES_TIMEOUT_MS = 10_000;

// What the company puts in a DNS TXT record of its domain, or in a meta tag
// of its home page, followed by the application's code.
export const DOMAIN_TXT_PREFIX = 'circlesfera-verification=';
export const DOMAIN_META_NAME = 'circlesfera-verification';
// The home page is read over HTTPS only, bounded in size and time.
export const HOME_PAGE_MAX_BYTES = 512 * 1024;
export const HOME_PAGE_TIMEOUT_MS = 10_000;

// The code sent to an address on the domain.
export const EMAIL_CODE_DIGITS = 6;
export const EMAIL_CODE_TTL_MS = 30 * 60 * 1000;
export const EMAIL_CODE_TRIES = 5;
// A new code waits a minute after the last one, and at most five are sent
// for an application in 24 hours.
export const EMAIL_CODE_RESEND_MS = 60 * 1000;
export const EMAIL_CODES_PER_DAY = 5;
export const EMAIL_CODES_WINDOW_MS = 24 * 60 * 60 * 1000;

// The documents of an application.
export const MAX_DOCUMENTS = 3;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;

export const LEGAL_NAME_MAX = 200;
