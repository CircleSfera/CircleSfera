import { describe, expect, it } from 'vitest';
import { assertMediaDurationInRange } from './media-duration.constants.js';

describe('assertMediaDurationInRange', () => {
  it('accepts Frame within 15–90s', () => {
    expect(assertMediaDurationInRange('FRAME', 15).ok).toBe(true);
    expect(assertMediaDurationInRange('FRAME', 45).ok).toBe(true);
    expect(assertMediaDurationInRange('FRAME', 90).ok).toBe(true);
  });

  it('rejects Frame outside window', () => {
    const short = assertMediaDurationInRange('FRAME', 10);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.code).toBe('FRAME_DURATION_OUT_OF_RANGE');

    const long = assertMediaDurationInRange('FRAME', 91);
    expect(long.ok).toBe(false);
  });

  it('enforces Story max 60s', () => {
    expect(assertMediaDurationInRange('STORY', 60).ok).toBe(true);
    const over = assertMediaDurationInRange('STORY', 61);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('STORY_DURATION_TOO_LONG');
  });

  it('enforces Post max 300s', () => {
    expect(assertMediaDurationInRange('POST', 300).ok).toBe(true);
    const over = assertMediaDurationInRange('POST', 301);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('POST_DURATION_TOO_LONG');
  });
});
