/**
 * The look of a Frame, as the app sends it and the server applies it: whole
 * numbers, each within its range. `neutral` leaves the picture as it is.
 */
export const FRAME_LOOK_RANGES = {
  brightness: { min: 0, max: 200, neutral: 100 },
  contrast: { min: 0, max: 200, neutral: 100 },
  saturation: { min: 0, max: 200, neutral: 100 },
  temperature: { min: 0, max: 200, neutral: 100 },
  sepia: { min: 0, max: 100, neutral: 0 },
  grayscale: { min: 0, max: 100, neutral: 0 },
  vignette: { min: 0, max: 100, neutral: 0 },
  noise: { min: 0, max: 100, neutral: 0 },
  hue: { min: 0, max: 360, neutral: 0 },
  blur: { min: 0, max: 10, neutral: 0 },
} as const;

export type FrameLookKey = keyof typeof FRAME_LOOK_RANGES;

export type FrameLook = Partial<Record<FrameLookKey, number>>;
