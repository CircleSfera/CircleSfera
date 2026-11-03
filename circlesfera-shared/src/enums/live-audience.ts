/**
 * Who a live is for: everyone who can see the host, only the host's close
 * friends, or a practice that only the host and their guest see.
 */
export const LIVE_AUDIENCES = [
  'EVERYONE',
  'CLOSE_FRIENDS',
  'PRACTICE',
] as const;
export type LiveAudience = (typeof LIVE_AUDIENCES)[number];

/** A live is for everyone unless its host chooses otherwise. */
export const DEFAULT_LIVE_AUDIENCE: LiveAudience = 'EVERYONE';

/** The longest title of a live, the same for the app and the server. */
export const LIVE_TITLE_MAX_LENGTH = 100;
