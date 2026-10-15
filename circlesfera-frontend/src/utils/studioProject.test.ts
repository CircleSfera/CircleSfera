import { describe, expect, it } from 'vitest';
import { mediaClip, studioTrack } from '../test/studio-fixtures';
import { freeStartOnTrack } from './studioProject';

describe('freeStartOnTrack', () => {
  it('starts at the playhead on a track with no clips', () => {
    expect(freeStartOnTrack(studioTrack('v1', 'video', []), 2, 3)).toBe(2);
  });

  it('starts at the playhead when that stretch of the track is free', () => {
    const track = studioTrack('v1', 'video', [
      mediaClip('first', { startAt: 0, duration: 3 }),
    ]);
    expect(freeStartOnTrack(track, 3, 3)).toBe(3);
  });

  it('goes after the last clip when it would cover one already there', () => {
    const track = studioTrack('v1', 'video', [
      mediaClip('first', { startAt: 0, duration: 3 }),
      mediaClip('second', { startAt: 5, duration: 4 }),
    ]);
    expect(freeStartOnTrack(track, 0, 3)).toBe(9);
    expect(freeStartOnTrack(track, 4, 2)).toBe(9);
  });

  it('starts at the playhead when there is no track', () => {
    expect(freeStartOnTrack(undefined, 1.5, 3)).toBe(1.5);
  });
});
