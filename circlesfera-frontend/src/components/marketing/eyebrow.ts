/**
 * The brand purple for small text on the public pages. The plain brand
 * colour is just under the contrast a 12 px text needs on the dark
 * background, so it is lifted a little towards white.
 */
export const BRAND_SMALL_TEXT =
  'text-[color-mix(in_srgb,var(--brand-primary)_80%,white)]';

/** The small uppercase label above a heading. */
export const EYEBROW = `text-xs font-bold uppercase tracking-[0.14em] ${BRAND_SMALL_TEXT}`;
