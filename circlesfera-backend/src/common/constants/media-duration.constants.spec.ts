import { describe, expect, it } from 'vitest';
import {
  assertMediaDurationInRange,
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
  POST_MAX_DURATION_SEC,
  STORY_MAX_DURATION_SEC,
} from './media-duration.constants.js';

describe('assertMediaDurationInRange', () => {
  it('accepts a Frame from its shortest to its longest length', () => {
    const middle = (FRAME_MIN_DURATION_SEC + FRAME_MAX_DURATION_SEC) / 2;
    for (const seconds of [
      FRAME_MIN_DURATION_SEC,
      middle,
      FRAME_MAX_DURATION_SEC,
    ]) {
      expect(assertMediaDurationInRange('FRAME', seconds).ok).toBe(true);
    }
  });

  it('rejects a Frame shorter or longer than that', () => {
    const short = assertMediaDurationInRange(
      'FRAME',
      FRAME_MIN_DURATION_SEC - 1,
    );
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.code).toBe('FRAME_DURATION_OUT_OF_RANGE');

    const long = assertMediaDurationInRange(
      'FRAME',
      FRAME_MAX_DURATION_SEC + 1,
    );
    expect(long.ok).toBe(false);
  });

  it('a Frame may last three minutes', () => {
    expect(FRAME_MAX_DURATION_SEC).toBe(3 * 60);
  });

  it('enforces the longest story video', () => {
    expect(assertMediaDurationInRange('STORY', STORY_MAX_DURATION_SEC).ok).toBe(
      true,
    );
    const over = assertMediaDurationInRange(
      'STORY',
      STORY_MAX_DURATION_SEC + 1,
    );
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('STORY_DURATION_TOO_LONG');
  });

  it('enforces the longest post video', () => {
    expect(assertMediaDurationInRange('POST', POST_MAX_DURATION_SEC).ok).toBe(
      true,
    );
    const over = assertMediaDurationInRange('POST', POST_MAX_DURATION_SEC + 1);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('POST_DURATION_TOO_LONG');
  });
});
