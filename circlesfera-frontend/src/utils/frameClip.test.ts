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

describe('frameClip helpers', () => {
  it('anchors presets to the Frame duration window', () => {
    expect(FRAME_DURATION_PRESETS[0]).toBe(FRAME_MIN_DURATION_SEC);
    expect(FRAME_DURATION_PRESETS.at(-1)).toBe(FRAME_MAX_DURATION_SEC);
  });

  it('rejects short sources for max length under min', () => {
    expect(maxFrameClipLength(8)).toBe(8);
    expect(availableFramePresets(8)).toEqual([]);
  });

  it('defaults to full source when under the Frame max', () => {
    expect(defaultFrameWindow(45)).toEqual({ startTime: 0, endTime: 45 });
    expect(defaultFrameWindow(FRAME_MAX_DURATION_SEC)).toEqual({
      startTime: 0,
      endTime: FRAME_MAX_DURATION_SEC,
    });
  });

  it('defaults to the Frame max for long sources', () => {
    expect(defaultFrameWindow(180)).toEqual({
      startTime: 0,
      endTime: FRAME_MAX_DURATION_SEC,
    });
  });

  it('lists available presets by source length', () => {
    expect(availableFramePresets(45)).toEqual([FRAME_MIN_DURATION_SEC, 30]);
    expect(availableFramePresets(FRAME_MAX_DURATION_SEC)).toEqual([
      ...FRAME_DURATION_PRESETS,
    ]);
    expect(availableFramePresets(180)).toEqual([...FRAME_DURATION_PRESETS]);
  });

  it('clamps length into 15–min(90, source) and start into range', () => {
    expect(clampFrameWindow(180, 0, 30)).toEqual({
      startTime: 0,
      endTime: 30,
    });
    expect(clampFrameWindow(180, 50, FRAME_MAX_DURATION_SEC)).toEqual({
      startTime: 50,
      endTime: 50 + FRAME_MAX_DURATION_SEC,
    });
    expect(clampFrameWindow(180, 0, 120)).toEqual({
      startTime: 0,
      endTime: FRAME_MAX_DURATION_SEC,
    });
    expect(clampFrameWindow(180, 0, 5)).toEqual({
      startTime: 0,
      endTime: FRAME_MIN_DURATION_SEC,
    });
    // Start past end → pull back
    expect(clampFrameWindow(100, 95, 30)).toEqual({
      startTime: 70,
      endTime: 100,
    });
  });

  it('reports clip length and range checks', () => {
    const ok = { startTime: 10, endTime: 40 };
    expect(frameClipLength(ok)).toBe(30);
    expect(isFrameClipInRange(ok)).toBe(true);
    expect(isFrameClipInRange({ startTime: 0, endTime: 10 })).toBe(false);
    expect(isFrameClipInRange({ startTime: 0, endTime: 100 })).toBe(false);
  });
});
