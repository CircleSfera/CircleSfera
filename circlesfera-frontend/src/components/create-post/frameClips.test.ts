import { describe, expect, it } from 'vitest';
import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
} from '../../constants/uploadLimits';
import {
  CLIP_MIN_MS,
  clipsLength,
  clipsMakeAFrame,
  moveClip,
  moveClipTo,
  trimClip,
  wholeClip,
} from './frameClips';

const file = (name: string) => new File(['v'], name, { type: 'video/webm' });
const clip = (ms: number, name = 'a.webm') =>
  wholeClip({ file: file(name), ms });

describe('the clips of a Frame', () => {
  it('start whole, and last together the sum of their windows', () => {
    const a = clip(4000);
    expect(a).toMatchObject({ startMs: 0, endMs: 4000 });
    expect(clipsLength([a, trimClip(clip(3000), { startMs: 1000 })])).toBe(
      6000,
    );
  });

  it('make a Frame only between its shortest and longest length', () => {
    const min = FRAME_MIN_DURATION_SEC * 1000;
    const max = FRAME_MAX_DURATION_SEC * 1000;
    expect(clipsMakeAFrame([clip(min - 1)])).toBe(false);
    expect(clipsMakeAFrame([clip(min)])).toBe(true);
    expect(clipsMakeAFrame([clip(max), clip(1)])).toBe(false);
    expect(clipsMakeAFrame([])).toBe(false);
  });

  it('keep a start before the end, by the shortest piece, inside the clip', () => {
    const a = clip(5000);
    expect(trimClip(a, { startMs: 4900 })).toMatchObject({
      startMs: 5000 - CLIP_MIN_MS,
      endMs: 5000,
    });
    expect(trimClip(a, { endMs: 9000 }).endMs).toBe(5000);
    expect(trimClip(a, { endMs: 0 })).toMatchObject({
      startMs: 0,
      endMs: CLIP_MIN_MS,
    });
    expect(trimClip(a, { startMs: -10 }).startMs).toBe(0);
  });

  it('move one place, and stay put at either end', () => {
    const list = [clip(1, 'a'), clip(1, 'b'), clip(1, 'c')];
    expect(moveClip(list, 2, -1).map((c) => c.file.name)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(moveClip(list, 0, -1)).toBe(list);
    expect(moveClip(list, 2, 1)).toBe(list);
  });
});

describe('moveClipTo', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((n) =>
    wholeClip({ file: new File([n], n), ms: 1000 }),
  );

  it('puts a clip at another place', () => {
    expect(moveClipTo([a, b, c], 0, 2)).toEqual([b, c, a]);
    expect(moveClipTo([a, b, c], 2, 0)).toEqual([c, a, b]);
  });

  it('keeps the clips as they are for a move to nowhere', () => {
    const clips = [a, b, c];
    expect(moveClipTo(clips, 1, 1)).toBe(clips);
    expect(moveClipTo(clips, 5, 0)).toBe(clips);
    expect(moveClipTo(clips, 0, 9)).toEqual([b, c, a]);
  });
});
