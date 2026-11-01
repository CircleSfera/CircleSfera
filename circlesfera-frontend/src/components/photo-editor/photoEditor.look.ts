import type { PhotoAdjustments } from './photoEditor.constants';

/** The CSS filter that shows the adjustments a CSS filter can express. */
export function photoAdjustmentsFilter(adjustments: PhotoAdjustments): string {
  return `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) sepia(${adjustments.sepia}%) grayscale(${adjustments.grayscale}%) hue-rotate(${adjustments.hue}deg) blur(${adjustments.blur}px)`;
}

/**
 * The CSS filter a filter's classes stand for, for where the classes cannot
 * be used: a canvas, or a picture that has a CSS filter of its own.
 */
export function photoFilterClassCss(filterClass: string): string {
  const parts: string[] = [];
  for (const cls of filterClass.split(' ')) {
    if (!cls) continue;
    if (cls === 'grayscale') parts.push('grayscale(100%)');
    else if (cls.startsWith('brightness-'))
      parts.push(`brightness(${cls.split('-')[1]}%)`);
    else if (cls.startsWith('contrast-'))
      parts.push(`contrast(${cls.split('-')[1]}%)`);
    else if (cls.startsWith('saturate-'))
      parts.push(`saturate(${cls.split('-')[1]}%)`);
    else if (cls.startsWith('hue-rotate-'))
      parts.push(`hue-rotate(${cls.split('rotate-')[1]}deg)`);
    else if (cls.startsWith('sepia-[')) {
      // `sepia-[.15]` is 15 %.
      const match = cls.match(/sepia-\[\.?(\d+)\]/);
      if (match) parts.push(`sepia(${match[1]}%)`);
    }
  }
  return parts.join(' ');
}

/**
 * The look of a photo as one string, in the format the export reads: the
 * filter classes, the CSS filter, and the three adjustments drawn as layers.
 */
export function buildPhotoFilterString(
  filterClass: string,
  adjustments: PhotoAdjustments,
): string {
  return `filter-class:${filterClass}__style:${photoAdjustmentsFilter(adjustments)}__temp:${adjustments.temperature}__vignette:${adjustments.vignette}__noise:${adjustments.noise}`;
}

/** One look for every slider of the editor. */
export const PHOTO_RANGE_CLASS =
  'appearance-none bg-transparent cursor-pointer outline-none h-11 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-1.5 [&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-white/10 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:bg-brand-primary [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full';
