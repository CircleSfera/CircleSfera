import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncedLibraryAudio } from './useSyncedLibraryAudio';

class FakeAudio {
  static made: FakeAudio[] = [];
  src: string;
  loop = true;
  muted = false;
  currentTime = 0;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
}

/** A video that tells its listeners what it does. */
function fakeVideo(paused = true) {
  const target = new EventTarget();
  const video = {
    currentTime: 0,
    paused,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };
  return {
    video,
    fire: (name: string) => target.dispatchEvent(new Event(name)),
  };
}

type Options = Parameters<typeof useSyncedLibraryAudio>[0];

function start(over: Partial<Options> = {}, paused = true) {
  const { video, fire } = fakeVideo(paused);
  const initialProps: Options = {
    enabled: true,
    trackUrl: 'https://cdn.example/track.mp3',
    audioStartMs: 12_000,
    isMuted: false,
    videoRef: { current: video as never },
    ...over,
  };
  const view = renderHook((props: Options) => useSyncedLibraryAudio(props), {
    initialProps,
  });
  return { video, fire, initialProps, ...view };
}
const audio = () => FakeAudio.made[FakeAudio.made.length - 1];

describe('useSyncedLibraryAudio', () => {
  beforeEach(() => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['it is switched off', { enabled: false }],
    ['the post has no track', { trackUrl: null }],
  ])('loads nothing when %s', (_why, over) => {
    start(over);
    expect(FakeAudio.made).toHaveLength(0);
  });

  it('gets the track ready at the moment chosen for the clip, without playing', () => {
    start();
    expect(audio().src).toBe('https://cdn.example/track.mp3');
    expect(audio()).toMatchObject({
      loop: false,
      muted: false,
      currentTime: 12,
    });
    expect(audio().play).not.toHaveBeenCalled();
  });

  it('starts from the beginning of the track when no moment was chosen, or a negative one', () => {
    start({ audioStartMs: null });
    expect(audio().currentTime).toBe(0);
    start({ audioStartMs: -500 });
    expect(audio().currentTime).toBe(0);
  });

  it('plays and pauses with the video', () => {
    const { fire } = start();

    fire('play');
    expect(audio().play).toHaveBeenCalledTimes(1);

    fire('pause');
    expect(audio().pause).toHaveBeenCalledTimes(1);
  });

  it('starts at once when the video is already playing', () => {
    start({}, false);
    expect(audio().play).toHaveBeenCalledTimes(1);
  });

  it('follows the video when it jumps', () => {
    const { video, fire } = start();

    video.currentTime = 8;
    fire('seeked');

    expect(audio().currentTime).toBe(20);
  });

  it('corrects a drift of more than a third of a second and leaves a smaller one', () => {
    const { video, fire } = start();

    video.currentTime = 5;
    audio().currentTime = 17.2;
    fire('timeupdate');
    expect(audio().currentTime).toBe(17.2);

    audio().currentTime = 17.5;
    fire('timeupdate');
    expect(audio().currentTime).toBe(17);
  });

  it('goes back to the chosen moment when the video ends', () => {
    const { fire } = start();
    audio().currentTime = 40;

    fire('ended');

    expect(audio().pause).toHaveBeenCalled();
    expect(audio().currentTime).toBe(12);
  });

  it('switches the sound on and off on the same track, without loading it again', () => {
    const { rerender, initialProps } = start();
    const first = audio();

    rerender({ ...initialProps, isMuted: true });
    expect(first.muted).toBe(true);

    rerender({ ...initialProps, isMuted: false });
    expect(first.muted).toBe(false);
    expect(FakeAudio.made).toHaveLength(1);
    expect(first.pause).not.toHaveBeenCalled();
  });

  it('starts silent when the sound is off', () => {
    start({ isMuted: true });
    expect(audio().muted).toBe(true);
  });

  it('lets go of the track and of the video when the post goes away', () => {
    const { fire, unmount } = start();
    const track = audio();

    unmount();

    expect(track.pause).toHaveBeenCalled();
    expect(track.src).toBe('');
    fire('play');
    expect(track.play).not.toHaveBeenCalled();
  });

  it('loads the new track when the post changes its music', () => {
    const { rerender, initialProps } = start();
    const first = audio();

    rerender({ ...initialProps, trackUrl: 'https://cdn.example/other.mp3' });

    expect(first.src).toBe('');
    expect(audio().src).toBe('https://cdn.example/other.mp3');
  });

  it('gets the track ready with no video to follow yet', () => {
    start({ videoRef: { current: null } });
    expect(audio().currentTime).toBe(12);
    expect(audio().play).not.toHaveBeenCalled();
  });
});
