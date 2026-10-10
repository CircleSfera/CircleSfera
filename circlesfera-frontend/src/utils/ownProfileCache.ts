import type { QueryClient } from '@tanstack/react-query';

interface OwnProfile {
  user?: object | null;
}

/**
 * Puts the answer to a save of the own Profile over what the app already
 * knows about it, and asks for it again.
 *
 * The answer to a save carries the fields of the Profile, not everything the
 * own-profile answer has: whether the email is verified is not in it. Kept
 * as the whole own Profile, every screen that reads it would take the email
 * for unverified until the next reload.
 *
 * Returns the Profile as the app now holds it.
 */
export function keepSavedOwnProfile<D extends OwnProfile>(
  queryClient: QueryClient,
  saved: { data: D },
): D {
  const known = queryClient.getQueryData<{ data: D }>(['myProfile']);
  const data: D = known
    ? {
        ...known.data,
        ...saved.data,
        user:
          known.data.user && saved.data.user
            ? { ...known.data.user, ...saved.data.user }
            : (saved.data.user ?? known.data.user),
      }
    : saved.data;
  queryClient.setQueryData(['myProfile'], { ...saved, data });
  queryClient.invalidateQueries({ queryKey: ['myProfile'] });
  return data;
}
