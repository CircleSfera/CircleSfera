/**
 * The kinds of business a Business Profile can say it is. A closed list:
 * a business picks one, it cannot write its own. Each has its name in the
 * app's languages under `profile.business.categories.<key>`.
 */
export const BUSINESS_CATEGORIES = [
  'RESTAURANT_BAR',
  'CAFE_BAKERY',
  'SHOP',
  'FASHION_ACCESSORIES',
  'BEAUTY_WELLNESS',
  'HEALTH',
  'SPORT_FITNESS',
  'HOTEL_LODGING',
  'TRAVEL_TOURISM',
  'EDUCATION',
  'PROFESSIONAL_SERVICES',
  'HOME_CONSTRUCTION',
  'MOTORING',
  'TECHNOLOGY',
  'MEDIA_ENTERTAINMENT',
  'ART_CULTURE',
  'EVENTS',
  'REAL_ESTATE',
  'FINANCE_INSURANCE',
  'NON_PROFIT',
  'OTHER',
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

/** The longest contact email a business can give. */
export const BUSINESS_CONTACT_EMAIL_MAX = 254;

/**
 * A contact phone in international format: a + and 8 to 15 digits, the
 * first not a zero.
 */
export const BUSINESS_CONTACT_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
