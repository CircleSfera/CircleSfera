import type { CSSProperties } from 'react';

/**
 * The colours a profile can choose for its page. The list is closed and the
 * server holds the same keys: each colour reads well on the dark background,
 * and coral is left out because it marks destructive actions.
 */
export const PROFILE_COLORS = {
  blue: { hex: '#3b82f6', rgb: '59, 130, 246' },
  cyan: { hex: '#06b6d4', rgb: '6, 182, 212' },
  teal: { hex: '#14b8a6', rgb: '20, 184, 166' },
  green: { hex: '#22c55e', rgb: '34, 197, 94' },
  amber: { hex: '#f59e0b', rgb: '245, 158, 11' },
  pink: { hex: '#ec4899', rgb: '236, 72, 153' },
  silver: { hex: '#cbd5e1', rgb: '203, 213, 225' },
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
    '--brand-primary-rgb': colour.rgb,
    '--color-brand-primary': colour.hex,
    '--brand-secondary': colour.hex,
    '--color-brand-secondary': colour.hex,
    '--brand-blue': colour.hex,
    '--color-brand-blue': colour.hex,
  } as CSSProperties;
}
