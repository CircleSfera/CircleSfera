import type { TFunction } from 'i18next';

// Someone in a block with the viewer, either way, stays in a conversation
// but the server sends them with no name, handle or picture and marks them
// unavailable: the app shows them as such, with no way to their Profile.
export function isUnavailable(profile: unknown): boolean {
  return (
    !!profile &&
    typeof profile === 'object' &&
    (profile as { unavailable?: unknown }).unavailable === true
  );
}

// The name to show for a person of a conversation.
export function personName(
  profile:
    | { username?: string | null; fullName?: string | null }
    | null
    | undefined,
  t: TFunction,
  fallback = t('chat.user'),
): string {
  if (isUnavailable(profile)) return t('chat.unavailable_user');
  return profile?.fullName || profile?.username || fallback;
}
