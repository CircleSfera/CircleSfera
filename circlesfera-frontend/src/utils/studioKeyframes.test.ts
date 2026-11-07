import { describe, expect, it } from 'vitest';
import { effectClip, mediaClip, textClip } from '../test/studio-fixtures';
import type { Keyframe } from '../types/studio';
import {
  changedValues,
  clipAt,
  ease,
  editedAt,
  framesExpr,
  hasKeyframeAt,
  hasKeyframes,
  KEYFRAME_EPS,
  keyframeExpr,
  keyframeTimes,
  keyPropsOf,
  MAX_KEYFRAMES,
  rangeOf,
  shareExpr,
  shiftedKeyframes,
  splitKeyframes,
  stretchedKeyframes,
  toggleKeyframe,
  valueAt,
  withBaseValue,
  withEdgeKeyframes,
  withValuesAt,
} from './studioKeyframes';

const moving = () =>
  mediaClip('a', {
    duration: 4,
    keyframes: {
      x: [
        { t: 1, v: 0 },
        { t: 3, v: 100 },
      ],
    },
  });

// Evaluates an ffmpeg expression the export writes, at a moment.
const evaluate = (expr: string, T: number) =>
  new Function('T', 'clip', `return ${expr.replaceAll('\\,', ',')};`)(
    T,
    (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)),
  );

describe('what can be animated', () => {
  it('follows CapCut: places, sound and colour, never an effect', () => {
    expect(keyPropsOf(mediaClip('v'))).toEqual([
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
    ]);
    expect(keyPropsOf(mediaClip('p', { type: 'image' }))).not.toContain(
      'volume',
    );
    expect(keyPropsOf(mediaClip('s', { type: 'audio' }))).toEqual(['volume']);
    expect(keyPropsOf(textClip('t'))).toEqual(['x', 'y', 'scale', 'opacity']);
    expect(keyPropsOf(effectClip('e'))).toEqual([]);
  });

  it('reads and sets each property’s own value', () => {
    let clip = mediaClip('v');
    for (const [prop, v] of [
      ['x', 5],
      ['y', 6],
      ['scale', 2],
      ['rotation', 30],
      ['opacity', 0.5],
      ['volume', 1.5],
      ['filter', 40],
      ['warmth', -20],
    ] as const) {
      clip = withBaseValue(clip, prop, v);
      expect(clipAt(clip, 0)).toBe(clip);
      expect(valueAt(clip, prop, 9)).toBe(v);
    }
    expect(clip.color).toMatchObject({ warmth: -20, brightness: 0 });
    const words = withBaseValue(textClip('t'), 'opacity', 0.3);
    expect(words.style.opacity).toBe(0.3);
    expect(valueAt(words, 'opacity', 0)).toBe(0.3);
    expect(valueAt(textClip('t'), 'opacity', 0)).toBe(1);
    expect(
      valueAt(mediaClip('v', { transform: undefined as never }), 'scale', 0),
    ).toBe(1);
  });
});

describe('a value between keyframes', () => {
  it('eases slowly out of one and into the next', () => {
    expect([ease(-1), ease(0), ease(0.5), ease(1), ease(2)]).toEqual([
      0, 0, 0.5, 1, 1,
    ]);
    expect(ease(0.25)).toBeCloseTo(0.15625);
  });

  it('holds before the first keyframe and after the last, and eases between', () => {
    const clip = moving();
    expect(valueAt(clip, 'x', 0)).toBe(0);
    expect(valueAt(clip, 'x', 2)).toBe(50);
    expect(valueAt(clip, 'x', 1.5)).toBeCloseTo(15.625);
    expect(valueAt(clip, 'x', 4)).toBe(100);
    expect(clipAt(clip, 2).transform.x).toBe(50);
    expect(clipAt(clip, 2).keyframes).toBe(clip.keyframes);
  });

  it('is the same in the export’s expression as in the preview', () => {
    const frames: Keyframe[] = [
      { t: 0.5, v: 10 },
      { t: 1.5, v: 10 },
      { t: 2, v: -30 },
      { t: 3.25, v: 80 },
    ];
    const clip = mediaClip('a', { keyframes: { rotation: frames } });
    const expr = keyframeExpr(clip, 'rotation', 'T');
    for (const T of [0, 0.7, 1.6, 1.9, 2.5, 3.25, 5]) {
      expect(evaluate(expr, T)).toBeCloseTo(valueAt(clip, 'rotation', T), 6);
    }
    // A step that changes nothing is left out.
    expect(expr.split('+')).toHaveLength(3);
    expect(keyframeExpr(mediaClip('b'), 'scale', 'T')).toBe('1');
    expect(framesExpr([], 7, 'T')).toBe('7');
  });

  it('gives the share of the way between the lowest and highest amounts', () => {
    const frames: Keyframe[] = [
      { t: 0, v: 0 },
      { t: 2, v: 100 },
    ];
    const { expr, low, high } = shareExpr(frames, 'T', (v) => 1 + v / 100);
    expect([low, high]).toEqual([1, 2]);
    expect(evaluate(expr, 1)).toBeCloseTo(0.5);
    expect(shareExpr([{ t: 0, v: 3 }], 'T', (v) => v)).toEqual({
      expr: '0',
      low: 3,
      high: 3,
    });
  });

  it('knows the range a property covers', () => {
    expect(rangeOf(moving(), 'x')).toEqual([0, 100]);
    expect(rangeOf(mediaClip('b'), 'scale')).toEqual([1, 1]);
  });
});

describe('setting keyframes', () => {
  it('adds one at a moment for every property, at what it shows there, and takes it away', () => {
    const clip = moving();
    const added = toggleKeyframe(clip, 2);
    expect(hasKeyframeAt(added, 2)).toBe(true);
    expect(added.keyframes?.x).toEqual([
      { t: 1, v: 0 },
      { t: 2, v: 50 },
      { t: 3, v: 100 },
    ]);
    expect(added.keyframes?.scale).toEqual([{ t: 2, v: 1 }]);
    expect(keyframeTimes(added)).toEqual([1, 2, 3]);
    const removed = toggleKeyframe(added, 2 + KEYFRAME_EPS / 2);
    expect(removed.keyframes).toEqual({ x: clip.keyframes?.x });
    const none = toggleKeyframe(toggleKeyframe(mediaClip('b'), 1), 1);
    expect(none.keyframes).toBeUndefined();
    expect(hasKeyframes(none)).toBe(false);
  });

  it('keys a change to an animated property, and changes the clip’s own value otherwise', () => {
    const clip = moving();
    const edited = withValuesAt(clip, { x: 70, scale: 2 }, 2);
    expect(edited.keyframes?.x).toContainEqual({ t: 2, v: 70 });
    expect(edited.transform.x).toBe(clip.transform.x);
    expect(edited.transform.scale).toBe(2);
    expect(edited.keyframes?.scale).toBeUndefined();
    const plain = withValuesAt(mediaClip('b'), { opacity: 0.4 }, 1);
    expect(plain).toMatchObject({ opacity: 0.4 });
    expect(plain.keyframes).toBeUndefined();
  });

  it('finds what an edit changed: only the fields it holds, against the clip at that moment', () => {
    const clip = moving();
    const shown = clipAt(clip, 2);
    expect(changedValues(clip, { opacity: 0.5 }, 2)).toEqual({ opacity: 0.5 });
    // A panel sends the place it shows: only a moved value changes.
    expect(
      changedValues(clip, { transform: { ...shown.transform, y: 30 } }, 2),
    ).toEqual({ y: 30 });
    // A trim holds none of them.
    expect(changedValues(clip, { duration: 2, startAt: 1 }, 2)).toEqual({});
  });

  describe('an edit at a moment of an animated clip', () => {
    const glowing = () =>
      mediaClip('a', {
        duration: 4,
        color: {
          brightness: 0,
          contrast: 0,
          saturation: 0,
          warmth: 0,
          exposure: 0,
          sharpness: 0,
        },
        keyframes: {
          brightness: [
            { t: 0, v: 0 },
            { t: 4, v: 100 },
          ],
          warmth: [
            { t: 0, v: 0 },
            { t: 4, v: 100 },
          ],
          volume: [
            { t: 0, v: 1 },
            { t: 4, v: 1 },
          ],
        },
      });

    it('keys the one moved, and keeps every animated property’s own value', () => {
      const clip = glowing();
      const shown = clipAt(clip, 2).color as NonNullable<typeof clip.color>;
      const edited = editedAt(clip, { color: { ...shown, contrast: 40 } }, 2);
      // Brightness and warmth showed 50; their own values stay at 0.
      expect(edited.color).toMatchObject({
        brightness: 0,
        warmth: 0,
        contrast: 40,
      });
      expect(edited.keyframes?.brightness).toEqual(clip.keyframes?.brightness);
    });

    it('keys an animated property set back to its own value', () => {
      const clip = glowing();
      const shown = clipAt(clip, 2).color as NonNullable<typeof clip.color>;
      const edited = editedAt(clip, { color: { ...shown, warmth: 0 } }, 2);
      expect(edited.keyframes?.warmth).toContainEqual({ t: 2, v: 0 });
    });

    it('keys a volume of 0 without silencing the whole clip', () => {
      const edited = editedAt(glowing(), { volume: 0, muted: true }, 2);
      expect(edited.keyframes?.volume).toContainEqual({ t: 2, v: 0 });
      expect(edited.muted).toBe(false);
    });

    it('is a plain edit on a clip without keyframes', () => {
      const plain = mediaClip('b');
      expect(editedAt(plain, { opacity: 0.3 }, 1)).toMatchObject({
        opacity: 0.3,
      });
    });
  });

  it('holds the value shown at a new edge with a keyframe there', () => {
    const clip = moving();
    expect(withEdgeKeyframes(clip, 2).keyframes?.x).toEqual([
      { t: 1, v: 0 },
      { t: 2, v: 50 },
      { t: 3, v: 100 },
    ]);
    // One there already, or no keyframes, change nothing.
    expect(withEdgeKeyframes(clip, 1).keyframes?.x).toHaveLength(2);
    expect(withEdgeKeyframes(mediaClip('b'), 1)).toEqual(mediaClip('b'));
  });

  it('stops adding at the most a property holds', () => {
    const frames = Array.from({ length: MAX_KEYFRAMES }, (_, i) => ({
      t: i / 10,
      v: i,
    }));
    const clip = mediaClip('a', { duration: 10, keyframes: { x: frames } });
    expect(withValuesAt(clip, { x: 1 }, 9.5).keyframes?.x).toHaveLength(
      MAX_KEYFRAMES,
    );
  });
});

describe('keyframes when a clip changes', () => {
  it('move with a trim of its start and go when they fall outside it', () => {
    const shifted = shiftedKeyframes({ ...moving(), duration: 3 }, -1.5);
    expect(shifted.keyframes?.x).toEqual([{ t: 1.5, v: 100 }]);
    const gone = shiftedKeyframes({ ...moving(), duration: 0.5 }, 0);
    expect(gone.keyframes).toBeUndefined();
    expect(shiftedKeyframes(mediaClip('b'), 1)).toEqual(mediaClip('b'));
  });

  it('stretch with a change of speed', () => {
    expect(stretchedKeyframes(moving(), 0.5).keyframes?.x).toEqual([
      { t: 0.5, v: 0 },
      { t: 1.5, v: 100 },
    ]);
    const same = moving();
    expect(stretchedKeyframes(same, 1)).toBe(same);
  });

  it('share out between the halves of a cut, each with the value at the cut', () => {
    const { first, second } = splitKeyframes(moving(), 2);
    expect(first?.x).toEqual([
      { t: 1, v: 0 },
      { t: 2, v: 50 },
    ]);
    expect(second?.x).toEqual([
      { t: 0, v: 50 },
      { t: 1, v: 100 },
    ]);
    expect(splitKeyframes(mediaClip('b'), 1)).toEqual({
      first: undefined,
      second: undefined,
    });
  });
});
