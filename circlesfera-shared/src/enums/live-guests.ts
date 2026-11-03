/** The most guests a live has at once, invited or on air, besides its host. */
export const LIVE_GUESTS_MAX = 3;

/**
 * Where a guest of a live is: invited and not answering yet, on air with the
 * host, or out of it because they declined, left, or the host removed them.
 */
export const LIVE_GUEST_STATUSES = [
  'INVITED',
  'ON_AIR',
  'DECLINED',
  'LEFT',
  'REMOVED',
] as const;
export type LiveGuestStatus = (typeof LIVE_GUEST_STATUSES)[number];
