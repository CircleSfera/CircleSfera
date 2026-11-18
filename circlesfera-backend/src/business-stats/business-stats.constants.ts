// What a visit or a tap on a Business Profile counts as. A closed list.
export const BUSINESS_STAT_KINDS = [
  'visit',
  'email',
  'call',
  'address',
  'website',
] as const;
export type BusinessStatKind = (typeof BUSINESS_STAT_KINDS)[number];

// The column of the daily totals each kind adds to.
export const BUSINESS_STAT_COLUMN = {
  visit: 'visits',
  email: 'emailTaps',
  call: 'callTaps',
  address: 'addressTaps',
  website: 'websiteTaps',
} as const satisfies Record<BusinessStatKind, string>;

// The stretches of days the statistics are read for.
export const BUSINESS_STAT_RANGES_DAYS = [7, 28, 90] as const;
export const BUSINESS_STAT_DEFAULT_RANGE_DAYS = 28;

// The daily totals are kept this many days (13 months).
export const BUSINESS_STAT_RETENTION_DAYS = 395;

// The best hours to post come from the views of this many days.
export const BUSINESS_STAT_HOURS_DAYS = 28;

// A country with fewer visits than this in the period is added to the
// others, so a single visitor is not told apart by where they are.
export const BUSINESS_STAT_MIN_COUNTRY_VISITS = 3;

// How many countries are listed; the rest are added up as others.
export const BUSINESS_STAT_TOP_COUNTRIES = 10;

// A person counts once a day per kind: the key that tells it lasts a bit
// more than a day, and is never stored with the totals.
export const BUSINESS_STAT_ONCE_SECONDS = 26 * 60 * 60;
