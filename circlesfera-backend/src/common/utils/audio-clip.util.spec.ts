import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { resolveAudioStartMs } from './audio-clip.util.js';

describe('resolveAudioStartMs', () => {
  it('returns 0 when no audioId', () => {
    expect(
      resolveAudioStartMs({
        audioId: null,
        audioStartMs: 5000,
        trackDurationSec: 120,
      }),
    ).toBe(0);
  });

  it('accepts a valid start within the track', () => {
    expect(
      resolveAudioStartMs({
        audioId: 'a1',
        audioStartMs: 12_500,
        trackDurationSec: 90,
      }),
    ).toBe(12_500);
  });

  it('defaults missing start to 0', () => {
    expect(
      resolveAudioStartMs({
        audioId: 'a1',
        trackDurationSec: 60,
      }),
    ).toBe(0);
  });

  it('rejects start at or past track end', () => {
    expect(() =>
      resolveAudioStartMs({
        audioId: 'a1',
        audioStartMs: 60_000,
        trackDurationSec: 60,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects negative start', () => {
    expect(() =>
      resolveAudioStartMs({
        audioId: 'a1',
        audioStartMs: -1,
        trackDurationSec: 60,
      }),
    ).toThrow(BadRequestException);
  });
});
