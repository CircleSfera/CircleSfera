import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../utils/logger';
import { type StoryAudioClip, useStoryPlayback } from './useStoryPlayback';

vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));

// A stand-in for the browser's audio element: it records what is asked of it.
class FakeAudio {
  static made: FakeAudio[] = [];
  static playFails = false;
  src: string;
  loop = true;
  muted = false;
  currentTime = 0;
  listeners: Record<string, () => void> = {};
  play = vi.fn(() =>
    FakeAudio.playFails
      ? Promise.reject(new Error('blocked'))
      : Promise.resolve(),
  );
  pause = vi.fn();
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  addEventListener(name: string, fn: () => void) {
    this.listeners[name] = fn;
  }
  removeEventListener(name: string) {
    delete this.listeners[name];
  }
}
const lastAudio = () => FakeAudio.made[FakeAudio.made.length - 1];

const onClose = vi.fn();
const play = (props: Partial<Parameters<typeof useStoryPlayback>[0]> = {}) =>
  renderHook(
    (current: Partial<Parameters<typeof useStoryPlayback>[0]>) =>
      useStoryPlayback({
        totalStories: 3,
        initialIndex: 0,
        onClose,
        storyDuration: 1000,
        progressInterval: 100,
        ...current,
      }),
    { initialProps: props },
  );
const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const press = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });

describe('useStoryPlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    FakeAudio.made = [];
    FakeAudio.playFails = false;
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts at the story it was given, with nothing played yet', () => {
    const { result } = play({ initialIndex: 1 });

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.progress).toBe(0);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.isMuted).toBe(false);
    expect(result.current.activeDurationMs).toBe(1000);
  });

  it('fills the bar over the duration of the story and moves to the next one', () => {
    const { result } = play();

    pass(500);
    expect(result.current.progress).toBeCloseTo(50);
    expect(result.current.currentIndex).toBe(0);

    pass(700);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.progress).toBeLessThan(20);
  });

  it('closes after the last story', () => {
    play({ totalStories: 1 });

    pass(1300);

    expect(onClose).toHaveBeenCalled();
  });

  it('takes the duration of each story when it is given, and the default when it is not usable', () => {
    const { result } = play({
      getDurationMs: (index) => (index === 0 ? 2000 : 0),
    });

    expect(result.current.activeDurationMs).toBe(2000);
    pass(1000);
    expect(result.current.progress).toBeCloseTo(50);

    act(() => result.current.handleNext());
    expect(result.current.activeDurationMs).toBe(1000);
  });

  it('never runs a story shorter than half a second', () => {
    const { result } = play({ getDurationMs: () => 100 });

    pass(200);

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.progress).toBeCloseTo(40);
  });

  it('stops while paused and goes on from where it was', () => {
    const { result } = play();

    pass(300);
    act(() => result.current.setIsPaused(true));
    pass(2000);
    expect(result.current.progress).toBeCloseTo(30);

    act(() => result.current.setIsPaused(false));
    pass(200);
    expect(result.current.progress).toBeCloseTo(50);
  });

  it('stops while something else holds it, and ignores the keys meanwhile', () => {
    const { result, rerender } = play({ isPausedOverride: true });

    pass(2000);
    press('ArrowRight');
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.progress).toBe(0);

    rerender({ isPausedOverride: false });
    press('ArrowRight');
    expect(result.current.currentIndex).toBe(1);
  });

  it('moves with the arrow keys and the space bar, and not before the first story', () => {
    const { result } = play();

    press('ArrowLeft');
    expect(result.current.currentIndex).toBe(0);
    press('ArrowRight');
    press(' ');
    expect(result.current.currentIndex).toBe(2);
    press('ArrowLeft');
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.progress).toBe(0);
    press('a');
    expect(result.current.currentIndex).toBe(1);
  });

  it('plays the clip of the story from where it starts, and loops it inside its window', () => {
    const clip: StoryAudioClip = {
      url: 'https://cdn.test/song.mp3',
      startMs: 4000,
      windowMs: 2000,
    };
    play({ getAudioClip: () => clip });

    const audio = lastAudio();
    expect(audio.src).toBe('https://cdn.test/song.mp3');
    expect(audio.loop).toBe(false);
    expect(audio.currentTime).toBe(4);
    expect(audio.play).toHaveBeenCalled();

    audio.currentTime = 5.5;
    audio.listeners.timeupdate();
    expect(audio.currentTime).toBe(5.5);
    audio.currentTime = 6.1;
    audio.listeners.timeupdate();
    expect(audio.currentTime).toBe(4);
  });

  it('uses the duration of the story as the window of a clip that gives none', () => {
    play({ getAudioClip: () => ({ url: 'https://cdn.test/song.mp3' }) });
    const audio = lastAudio();

    audio.currentTime = 0.9;
    audio.listeners.timeupdate();
    expect(audio.currentTime).toBe(0.9);
    audio.currentTime = 1;
    audio.listeners.timeupdate();
    expect(audio.currentTime).toBe(0);
  });

  it('brings a clip that fell behind its start back to it', () => {
    const { result } = play({
      getAudioClip: () => ({ url: 'https://cdn.test/song.mp3', startMs: 3000 }),
    });
    const audio = lastAudio();

    audio.currentTime = 1;
    act(() => result.current.setIsMuted(true));

    expect(audio.muted).toBe(true);
    expect(audio.currentTime).toBe(3);
  });

  it('pauses the clip with the story, and plays it again after', () => {
    const { result } = play({
      getAudioClip: () => ({ url: 'https://cdn.test/song.mp3' }),
    });
    const audio = lastAudio();
    audio.play.mockClear();

    act(() => result.current.setIsPaused(true));
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.play).not.toHaveBeenCalled();

    act(() => result.current.setIsPaused(false));
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('lets go of the clip when the story changes, and makes none for a story without one', () => {
    const { result } = play({
      getAudioClip: (index) =>
        index === 0 ? { url: 'https://cdn.test/song.mp3' } : null,
    });
    const first = lastAudio();

    act(() => result.current.handleNext());

    expect(first.pause).toHaveBeenCalled();
    expect(first.src).toBe('');
    expect(first.listeners.timeupdate).toBeUndefined();
    expect(FakeAudio.made).toHaveLength(1);
  });

  it('lets go of the clip when the viewer goes away', () => {
    const { unmount } = play({
      getAudioClip: () => ({ url: 'https://cdn.test/song.mp3' }),
    });
    const audio = lastAudio();

    unmount();

    expect(audio.src).toBe('');
  });

  it('records a clip the browser refuses to play, and the story goes on', async () => {
    FakeAudio.playFails = true;
    const { result } = play({
      getAudioClip: () => ({ url: 'https://cdn.test/song.mp3' }),
    });

    await act(async () => {
      await Promise.resolve();
    });
    pass(500);

    expect(logger.error).toHaveBeenCalledWith(
      'Story audio playback failed',
      expect.any(Error),
    );
    expect(result.current.progress).toBeCloseTo(50);
  });
});
