// Chooses which Profile a session acts as. Sanctions apply to a single
// Profile, so an account whose first Profile is banned can still sign in with
// another one.

export interface SessionProfileCandidate {
  id: string;
  isAccountBanned: boolean;
  accountBanReason?: string | null;
  suspendedUntil?: Date | null;
}

export const SESSION_PROFILE_SELECT = {
  id: true,
  isAccountBanned: true,
  accountBanReason: true,
  suspendedUntil: true,
} as const;

// Oldest first, with a stable tie-break.
export const SESSION_PROFILE_ORDER = [
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

export function isProfileUsable(
  profile: SessionProfileCandidate,
  now: Date = new Date(),
): boolean {
  if (profile.isAccountBanned) return false;
  return !(profile.suspendedUntil && profile.suspendedUntil > now);
}

// `profiles` must be ordered oldest first.
// - With `boundProfileId` (a session already acting as a Profile): that
//   Profile, even if it is banned, so the caller rejects the request instead
//   of silently acting as a different Profile. Falls back to the default
//   choice only if the bound Profile no longer exists.
// - Without it (a new sign-in): the oldest usable Profile; if none is usable,
//   the oldest Profile, so the caller can report why access is refused.
export function pickSessionProfile<T extends SessionProfileCandidate>(
  profiles: readonly T[],
  boundProfileId?: string | null,
  now: Date = new Date(),
): T | undefined {
  if (boundProfileId) {
    const bound = profiles.find((p) => p.id === boundProfileId);
    if (bound) return bound;
  }
  return profiles.find((p) => isProfileUsable(p, now)) ?? profiles[0];
}
