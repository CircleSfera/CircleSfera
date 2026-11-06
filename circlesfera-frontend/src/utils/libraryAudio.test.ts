import { describe, expect, it } from 'vitest';
import { libraryTrackUrl } from './libraryAudio';

const audio = {
  id: 'a',
  title: 'S',
  artist: 'A',
  url: 'https://cdn/s.mp3',
  duration: 30,
};

describe('the song played over a post', () => {
  it('is the one attached from the library', () => {
    expect(libraryTrackUrl({ audio })).toBe('https://cdn/s.mp3');
  });

  it('is none when the song is already in the video, or there is none', () => {
    expect(libraryTrackUrl({ audio, audioInVideo: true })).toBeUndefined();
    expect(libraryTrackUrl({ audio: null })).toBeUndefined();
  });
});
