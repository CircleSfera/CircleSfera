import {
  FRAME_LOOK_RANGES,
  type FrameLook,
  type FrameLookKey,
} from '@circlesfera/shared';
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  type PhotoAdjustments,
} from '../photo-editor/photoEditor.constants';

/** How strong a filter is, as a share: 0 is none, the most is the filter. */
export const FRAME_FILTER_STRENGTH_MAX = 100;

/** The values a filter's classes stand for, the way the server reads them. */
export function filterClassLook(filterClass: string): FrameLook {
  const look: FrameLook = {};
  for (const cls of filterClass.split(' ')) {
    if (cls === 'grayscale') look.grayscale = 100;
    else if (cls.startsWith('brightness-'))
      look.brightness = Number(cls.split('-')[1]);
    else if (cls.startsWith('contrast-'))
      look.contrast = Number(cls.split('-')[1]);
    else if (cls.startsWith('saturate-'))
      look.saturation = Number(cls.split('-')[1]);
    else if (cls.startsWith('hue-rotate-'))
      look.hue = Number(cls.split('rotate-')[1]);
    else if (cls.startsWith('sepia-[')) {
      // `sepia-[.15]` is 15 %.
      const match = cls.match(/sepia-\[\.?(\d+)\]/);
      if (match) look.sepia = Number(match[1]);
    }
  }
  return look;
}

const value = (look: FrameLook, key: FrameLookKey): number =>
  look[key] ?? FRAME_LOOK_RANGES[key].neutral;

/** A turn as one between -180 and 180 degrees, to be scaled. */
const signedTurn = (deg: number): number => (deg > 180 ? deg - 360 : deg);

/**
 * The look of a Frame from its filter, how strong the filter is, and the
 * adjustments made over it, in whole numbers within their ranges. Values that
 * leave the picture as it is are left out.
 */
export function frameLookOf(
  filterClass: string,
  strength: number = FRAME_FILTER_STRENGTH_MAX,
  adjustments: PhotoAdjustments = DEFAULT_PHOTO_ADJUSTMENTS,
): FrameLook {
  const filter = filterClassLook(filterClass);
  const share =
    Math.min(Math.max(strength, 0), FRAME_FILTER_STRENGTH_MAX) /
    FRAME_FILTER_STRENGTH_MAX;
  // The filter's part, from nothing at 0 to all of it at the most.
  const towards = (key: FrameLookKey) => {
    const neutral = FRAME_LOOK_RANGES[key].neutral;
    return neutral + (value(filter, key) - neutral) * share;
  };
  const raw: Record<FrameLookKey, number> = {
    // Applied one after the other, as CSS does: the parts multiply.
    brightness: (towards('brightness') * adjustments.brightness) / 100,
    contrast: (towards('contrast') * adjustments.contrast) / 100,
    saturation: (towards('saturation') * adjustments.saturation) / 100,
    sepia: towards('sepia') + adjustments.sepia,
    grayscale: towards('grayscale') + adjustments.grayscale,
    hue:
      (((signedTurn(value(filter, 'hue')) * share + adjustments.hue) % 360) +
        360) %
      360,
    temperature: adjustments.temperature,
    vignette: adjustments.vignette,
    noise: adjustments.noise,
    blur: adjustments.blur,
  };
  const look: FrameLook = {};
  for (const key of Object.keys(FRAME_LOOK_RANGES) as FrameLookKey[]) {
    const range = FRAME_LOOK_RANGES[key];
    const whole = Math.min(
      Math.max(Math.round(raw[key]), range.min),
      range.max,
    );
    if (whole !== range.neutral) look[key] = whole;
  }
  return look;
}

/**
 * The look as a CSS filter, to show it on the video before the server puts
 * it on: grayscale takes colour away the way the server does, from the
 * saturation. Temperature, vignette and grain are not shown.
 */
export function frameLookCss(look: FrameLook): string {
  const saturation =
    (value(look, 'saturation') * (100 - value(look, 'grayscale'))) / 100;
  return [
    `brightness(${value(look, 'brightness')}%)`,
    `contrast(${value(look, 'contrast')}%)`,
    `saturate(${saturation}%)`,
    `sepia(${value(look, 'sepia')}%)`,
    `hue-rotate(${value(look, 'hue')}deg)`,
    `blur(${value(look, 'blur')}px)`,
  ].join(' ');
}

/**
 * The look kept in a media's filter text (the photo editor's), for a video
 * the server puts together: the filter at its full strength and the
 * adjustments over it.
 */
export function frameLookFromFilterText(text: string | undefined): FrameLook {
  if (!text) return {};
  const filterClass = /filter-class:(.*?)(?:__|$)/.exec(text)?.[1] ?? '';
  const style = /__style:(.*?)(?:__temp:|$)/.exec(text)?.[1] ?? '';
  const percent = (name: string, fallback: number) => {
    const match = new RegExp(
      `${name}\\((-?\\d+(?:\\.\\d+)?)(?:%|deg|px)\\)`,
    ).exec(style);
    return match ? Number(match[1]) : fallback;
  };
  const after = (name: string, fallback: number) => {
    const match = new RegExp(`__${name}:(-?\\d+(?:\\.\\d+)?)`).exec(text);
    return match ? Number(match[1]) : fallback;
  };
  const d = DEFAULT_PHOTO_ADJUSTMENTS;
  return frameLookOf(filterClass, FRAME_FILTER_STRENGTH_MAX, {
    brightness: percent('brightness', d.brightness),
    contrast: percent('contrast', d.contrast),
    saturation: percent('saturate', d.saturation),
    sepia: percent('sepia', d.sepia),
    grayscale: percent('grayscale', d.grayscale),
    hue: percent('hue-rotate', d.hue),
    blur: percent('blur', d.blur),
    temperature: after('temp', d.temperature),
    vignette: after('vignette', d.vignette),
    noise: after('noise', d.noise),
  });
}
