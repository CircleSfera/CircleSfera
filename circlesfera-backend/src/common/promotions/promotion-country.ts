// How a promotion is aimed: by country only, from the closed list.

/**
 * The country of a viewer: the one the person chose in settings, or else the
 * one of the network at sign-up. Never the free text of a location.
 */
export function viewerCountryOf(
  user:
    | {
        signupCountry?: string | null;
        settings?: { country?: string | null } | null;
      }
    | null
    | undefined,
): string | null {
  return user?.settings?.country ?? user?.signupCountry ?? null;
}

/**
 * Whether a promotion reaches a viewer: one with no countries reaches
 * everywhere; otherwise only a viewer known to be in one of them.
 */
export function promotionReaches(
  countries: string | null | undefined,
  viewerCountry: string | null,
): boolean {
  const aimed = (countries ?? '').split(',').filter(Boolean);
  if (aimed.length === 0) return true;
  return !!viewerCountry && aimed.includes(viewerCountry);
}
