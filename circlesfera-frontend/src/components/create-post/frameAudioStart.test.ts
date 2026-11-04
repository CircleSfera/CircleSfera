import { describe, expect, it } from 'vitest';
import { frameWithAudioRoute, readFrameAudio } from './frameAudioStart';

const song = {
  id: 'a1',
  title: 'Summer',
  artist: 'Nia',
  url: '/s.mp3',
  duration: 30,
};

describe('a new Frame with a song', () => {
  it('opens Create in Frame mode carrying the song, read back once', () => {
    const route = frameWithAudioRoute(song);
    expect(route.to).toBe('/create?mode=frame');
    expect(readFrameAudio(route.options.state)).toEqual(song);
  });

  it('reads nothing from any other state', () => {
    expect(readFrameAudio(null)).toBeNull();
    expect(readFrameAudio({})).toBeNull();
    expect(readFrameAudio({ frameAudio: { id: 'a1' } })).toBeNull();
  });
});
