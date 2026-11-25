/**
 * An application to be a founding creator (BD-034): links to the Profile's
 * work, its city and a short note. The server checks the same limits.
 */

/** The fewest and the most links to the Profile's work. */
export const FOUNDING_CREATOR_LINKS_MIN = 1;
export const FOUNDING_CREATOR_LINKS_MAX = 3;

/** The longest link, in characters. */
export const FOUNDING_CREATOR_LINK_MAX_LENGTH = 300;

/** The shortest and the longest city name, in characters. */
export const FOUNDING_CREATOR_CITY_MIN_LENGTH = 2;
export const FOUNDING_CREATOR_CITY_MAX_LENGTH = 80;

/** The longest note of the person, and of staff when declining. */
export const FOUNDING_CREATOR_NOTE_MAX_LENGTH = 500;

/** How long the free Verified plan of a founding creator lasts, in months. */
export const FOUNDING_CREATOR_FREE_MONTHS = 12;
