import type { CSSProperties } from 'react';

// What is drawn over a button filled with the colour: white where it can be
// told apart from the fill, near black over the lighter colours.
const ON_DARK_COLOR = '#ffffff';
const ON_LIGHT_COLOR = '#0a0a0a';

/**
 * The colours a profile can choose for its page. The list is closed and the
 * server holds the same keys: each colour reads well on the dark background,
 * and coral is left out because it marks destructive actions.
 */
export const PROFILE_COLORS = {
  blue: { hex: '#3b82f6', rgb: '59, 130, 246', on: ON_DARK_COLOR },
  cyan: { hex: '#06b6d4', rgb: '6, 182, 212', on: ON_LIGHT_COLOR },
  teal: { hex: '#14b8a6', rgb: '20, 184, 166', on: ON_LIGHT_COLOR },
  green: { hex: '#22c55e', rgb: '34, 197, 94', on: ON_LIGHT_COLOR },
  amber: { hex: '#f59e0b', rgb: '245, 158, 11', on: ON_LIGHT_COLOR },
  pink: { hex: '#ec4899', rgb: '236, 72, 153', on: ON_DARK_COLOR },
  silver: { hex: '#cbd5e1', rgb: '203, 213, 225', on: ON_LIGHT_COLOR },
} as const;

export type ProfileColorKey = keyof typeof PROFILE_COLORS;

export const PROFILE_COLOR_KEYS = Object.keys(
  PROFILE_COLORS,
) as ProfileColorKey[];

export function profileColor(key: string | null | undefined) {
  return key && key in PROFILE_COLORS
    ? PROFILE_COLORS[key as ProfileColorKey]
    : null;
}

/**
 * The brand colours of the app, replaced by the chosen one for everything
 * inside the element that gets this style. Undefined for no choice, so the
 * page keeps the colours of the app.
 */
export function profileColorStyle(
  key: string | null | undefined,
): CSSProperties | undefined {
  const colour = profileColor(key);
  if (!colour) return undefined;
  return {
    '--brand-primary': colour.hex,
    '--on-brand-primary': colour.on,
    '--brand-primary-rgb': colour.rgb,
    '--color-brand-primary': colour.hex,
    '--brand-secondary': colour.hex,
    '--color-brand-secondary': colour.hex,
    '--brand-blue': colour.hex,
    '--color-brand-blue': colour.hex,
  } as CSSProperties;
}
