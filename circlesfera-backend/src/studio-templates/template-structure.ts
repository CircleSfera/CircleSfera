/*
 * The structure of an Edits Studio template, rebuilt from what a client
 * sends: only the fields a template has, each within its bounds. It never
 * keeps anyone's media, voice or text. A library song is checked against
 * the library by the service.
 */

export const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:5'] as const;
export const TRANSITION_KINDS = [
  'crossfade',
  'fadeblack',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'zoomin',
  'blur',
] as const;
export const EFFECT_KINDS = [
  'blur',
  'vignette',
  'grain',
  'shake',
  'slowzoom',
  'mono',
  'glow',
  'rgbsplit',
] as const;
export const KEY_PROPS = [
  'x',
  'y',
  'scale',
  'rotation',
  'opacity',
  'volume',
  'brightness',
  'contrast',
  'saturation',
  'warmth',
  'exposure',
  'sharpness',
  'filter',
] as const;
const COLOR_KEYS = [
  'brightness',
  'contrast',
  'saturation',
  'warmth',
  'exposure',
  'sharpness',
] as const;

/** The most a template holds. */
export const TEMPLATE_LIMITS = {
  slots: 60,
  effects: 50,
  keyframes: 50,
  seconds: 600,
  filterLength: 120,
} as const;

export interface TemplateSong {
  audioId: string;
  url: string;
  title: string;
  mediaStart: number;
  startAt: number;
  duration: number;
}

export interface TemplateStructure {
  version: 1;
  name: string;
  aspectRatio: (typeof ASPECT_RATIOS)[number];
  slots: Record<string, unknown>[];
  effects: Record<string, unknown>[];
  song?: TemplateSong;
}

/** A structure a client sent that is not a template. */
export class InvalidTemplateError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new InvalidTemplateError(`${what} is out of bounds`);
  }
  return v;
}

function oneOf<T extends readonly string[]>(
  v: unknown,
  list: T,
  what: string,
): T[number] {
  if (typeof v !== 'string' || !list.includes(v)) {
    throw new InvalidTemplateError(`${what} is not known`);
  }
  return v as T[number];
}

function list(v: unknown, most: number, what: string): unknown[] {
  if (!Array.isArray(v) || v.length > most) {
    throw new InvalidTemplateError(`${what} is not a list within bounds`);
  }
  return v;
}

// A CSS filter of the editor's: functions and numbers only, no addresses.
const FILTER = /^[a-z-]+\([0-9.\s%a-z-]*\)(\s+[a-z-]+\([0-9.\s%a-z-]*\))*$/;

function slotOf(v: unknown): Record<string, unknown> {
  if (!isObject(v)) throw new InvalidTemplateError('a slot is not an object');
  const { seconds } = TEMPLATE_LIMITS;
  const slot: Record<string, unknown> = {
    duration: num(v.duration, 0.1, seconds, 'a slot length'),
    speed: num(v.speed, 0.25, 3, 'a slot speed'),
  };
  if (v.transitionOut !== undefined) {
    if (!isObject(v.transitionOut)) {
      throw new InvalidTemplateError('a transition is not an object');
    }
    slot.transitionOut = {
      kind: oneOf(v.transitionOut.kind, TRANSITION_KINDS, 'a transition'),
      duration: num(v.transitionOut.duration, 0.1, 1.5, 'a transition length'),
    };
  }
  if (v.filter !== undefined && v.filter !== '') {
    if (
      typeof v.filter !== 'string' ||
      v.filter.length > TEMPLATE_LIMITS.filterLength ||
      !FILTER.test(v.filter)
    ) {
      throw new InvalidTemplateError('a filter is not one of the editor’s');
    }
    slot.filter = v.filter;
  }
  if (v.filterIntensity !== undefined) {
    slot.filterIntensity = num(v.filterIntensity, 0, 100, 'a filter intensity');
  }
  if (v.color !== undefined) {
    if (!isObject(v.color))
      throw new InvalidTemplateError('a colour is not an object');
    const color = v.color;
    slot.color = Object.fromEntries(
      COLOR_KEYS.map((key) => [
        key,
        num(color[key] ?? 0, -100, 100, 'a colour'),
      ]),
    );
  }
  if (v.keyframes !== undefined) {
    if (!isObject(v.keyframes)) {
      throw new InvalidTemplateError('keyframes are not an object');
    }
    const frames: Record<string, { t: number; v: number }[]> = {};
    for (const [prop, values] of Object.entries(v.keyframes)) {
      const key = oneOf(prop, KEY_PROPS, 'a keyframed property');
      frames[key] = list(values, TEMPLATE_LIMITS.keyframes, 'keyframes').map(
        (f) => {
          if (!isObject(f))
            throw new InvalidTemplateError('a keyframe is not an object');
          return {
            t: num(f.t, 0, seconds, 'a keyframe time'),
            v: num(f.v, -10000, 10000, 'a keyframe value'),
          };
        },
      );
    }
    slot.keyframes = frames;
  }
  return slot;
}

function effectOf(v: unknown): Record<string, unknown> {
  if (!isObject(v))
    throw new InvalidTemplateError('an effect is not an object');
  const { seconds } = TEMPLATE_LIMITS;
  return {
    startAt: num(v.startAt, 0, seconds, 'an effect start'),
    duration: num(v.duration, 0.1, seconds, 'an effect length'),
    effect: oneOf(v.effect, EFFECT_KINDS, 'an effect'),
    intensity: num(v.intensity, 0, 100, 'an effect intensity'),
  };
}

function songOf(v: unknown): TemplateSong {
  if (!isObject(v)) throw new InvalidTemplateError('a song is not an object');
  const { seconds } = TEMPLATE_LIMITS;
  if (typeof v.audioId !== 'string' || typeof v.url !== 'string') {
    throw new InvalidTemplateError('a song has no id or address');
  }
  return {
    audioId: v.audioId,
    url: v.url,
    // The library's own title replaces it once checked.
    title: '',
    mediaStart: num(v.mediaStart, 0, 3600, 'a song start'),
    startAt: num(v.startAt, 0, seconds, 'a song place'),
    duration: num(v.duration, 0.1, seconds, 'a song length'),
  };
}

/** The template a client sent, rebuilt, or an error saying why it is not one. */
export function templateStructureOf(
  input: unknown,
  name: string,
): TemplateStructure {
  if (!isObject(input) || input.version !== 1) {
    throw new InvalidTemplateError('not a template');
  }
  const slots = list(input.slots, TEMPLATE_LIMITS.slots, 'slots').map(slotOf);
  if (slots.length === 0)
    throw new InvalidTemplateError('a template has no slots');
  return {
    version: 1,
    name,
    aspectRatio: oneOf(input.aspectRatio, ASPECT_RATIOS, 'a format'),
    slots,
    effects: list(input.effects ?? [], TEMPLATE_LIMITS.effects, 'effects').map(
      effectOf,
    ),
    ...(input.song !== undefined && input.song !== null
      ? { song: songOf(input.song) }
      : {}),
  };
}
