/**
 * Tips and live gifts, the money a person gives a creator without buying
 * anything: a tip is always for a post (or Frame), at one of these amounts,
 * and one person gives at most WEEKLY_SUPPORT_LIMIT_CENTS in any seven days,
 * tips and live gifts together. So the platform is never a way to send
 * money from one person to another.
 */
export const TIP_AMOUNTS_CENTS = [200, 500, 1000, 2000, 5000] as const;
export const WEEKLY_SUPPORT_LIMIT_CENTS = 50000;
export const WEEKLY_SUPPORT_WINDOW_DAYS = 7;
