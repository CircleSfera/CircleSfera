import { describe, expect, it } from 'vitest';
import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
} from '../constants/uploadLimits';
import {
  availableFramePresets,
  clampFrameWindow,
  defaultFrameWindow,
  FRAME_DURATION_PRESETS,
  frameClipLength,
  isFrameClipInRange,
  maxFrameClipLength,
} from './frameClip';

/** A source longer than any Frame. */
const LONG = FRAME_MAX_DURATION_SEC * 2;

describe('frameClip helpers', () => {
  it('anchors presets to the Frame duration window', () => {
    expect(FRAME_DURATION_PRESETS[0]).toBe(FRAME_MIN_DURATION_SEC);
    expect(FRAME_DURATION_PRESETS.at(-1)).toBe(FRAME_MAX_DURATION_SEC);
  });

  it('rejects short sources for max length under min', () => {
    const short = FRAME_MIN_DURATION_SEC - 1;
    expect(maxFrameClipLength(short)).toBe(short);
    expect(availableFramePresets(short)).toEqual([]);
  });

  it('defaults to full source when under the Frame max', () => {
    const under = FRAME_MAX_DURATION_SEC - 1;
    expect(defaultFrameWindow(under)).toEqual({ startTime: 0, endTime: under });
    expect(defaultFrameWindow(FRAME_MAX_DURATION_SEC)).toEqual({
      startTime: 0,
      endTime: FRAME_MAX_DURATION_SEC,
    });
  });

  it('defaults to the Frame max for long sources', () => {
    expect(defaultFrameWindow(LONG)).toEqual({
      startTime: 0,
      endTime: FRAME_MAX_DURATION_SEC,
    });
  });

  it('lists available presets by source length', () => {
    const between = FRAME_DURATION_PRESETS[1] + 1;
    expect(availableFramePresets(between)).toEqual(
      FRAME_DURATION_PRESETS.slice(0, 2),
    );
    expect(availableFramePresets(FRAME_MAX_DURATION_SEC)).toEqual([
      ...FRAME_DURATION_PRESETS,
    ]);
    expect(availableFramePresets(LONG)).toEqual([...FRAME_DURATION_PRESETS]);
  });

  it('clamps the length between the shortest and longest Frame, and the start into the source', () => {
    const preset = FRAME_DURATION_PRESETS[1];
    expect(clampFrameWindow(LONG, 0, preset)).toEqual({
      startTime: 0,
      endTime: preset,
    });
    expect(clampFrameWindow(LONG, preset, FRAME_MAX_DURATION_SEC)).toEqual({
      startTime: preset,
      endTime: preset + FRAME_MAX_DURATION_SEC,
    });
    expect(clampFrameWindow(LONG, 0, FRAME_MAX_DURATION_SEC + 1)).toEqual({
      startTime: 0,
      endTime: FRAME_MAX_DURATION_SEC,
    });
    expect(clampFrameWindow(LONG, 0, FRAME_MIN_DURATION_SEC - 1)).toEqual({
      startTime: 0,
      endTime: FRAME_MIN_DURATION_SEC,
    });
    // A start too late for the length is pulled back to fit the source.
    const source = FRAME_MIN_DURATION_SEC * 4;
    expect(clampFrameWindow(source, source - 1, preset)).toEqual({
      startTime: source - preset,
      endTime: source,
    });
  });

  it('reports clip length and range checks', () => {
    const ok = { startTime: 1, endTime: 1 + FRAME_MIN_DURATION_SEC * 2 };
    expect(frameClipLength(ok)).toBe(FRAME_MIN_DURATION_SEC * 2);
    expect(isFrameClipInRange(ok)).toBe(true);
    expect(
      isFrameClipInRange({ startTime: 0, endTime: FRAME_MIN_DURATION_SEC - 1 }),
    ).toBe(false);
    expect(
      isFrameClipInRange({ startTime: 0, endTime: FRAME_MAX_DURATION_SEC + 1 }),
    ).toBe(false);
  });
});
