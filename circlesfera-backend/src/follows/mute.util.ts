/** Allowed mute durations for POST /users/:username/follow/mute */
export const MUTE_DURATIONS = ['24h', '7d', '30d', 'forever'] as const;
export type MuteDuration = (typeof MUTE_DURATIONS)[number];

const MS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
} as const;

/** Map API duration to expiresAt. `forever` / omitted → null. */
export function muteExpiresAtFromDuration(
  duration: MuteDuration | undefined,
  now = new Date(),
): Date | null {
  switch (duration ?? 'forever') {
    case '24h':
      return new Date(now.getTime() + 24 * MS.hour);
    case '7d':
      return new Date(now.getTime() + 7 * MS.day);
    case '30d':
      return new Date(now.getTime() + 30 * MS.day);
    case 'forever':
      return null;
  }
}

/** Prisma `where` for mutes that still suppress content. */
export function activeMuteWhere(muterId: string, now = new Date()) {
  return {
    muterId,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
