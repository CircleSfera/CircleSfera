import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryPlayback } from './useStoryPlayback';

vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));

// The sound of a story, reduced to what the playback drives.
class FakeAudio {
  static made: FakeAudio[] = [];
  src: string;
  loop = true;
  muted = false;
  currentTime = 0;
  listeners = new Map<string, () => void>();
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  addEventListener(name: string, run: () => void) {
    this.listeners.set(name, run);
  }
  removeEventListener(name: string) {
    this.listeners.delete(name);
  }
}

describe('useStoryPlayback', () => {
  const onClose = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const play = (props: Partial<Parameters<typeof useStoryPlayback>[0]> = {}) =>
    renderHook(
      (given: Partial<Parameters<typeof useStoryPlayback>[0]>) =>
        useStoryPlayback({
          totalStories: 3,
          initialIndex: 0,
          onClose,
          storyDuration: 1000,
          progressInterval: 100,
          ...props,
          ...given,
        }),
      { initialProps: {} },
    );
  const pass = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const press = (key: string) =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });

  it('fills the bar over the length of the story and then moves to the next one', () => {
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

  it('uses the length of each story when it has one, and never less than half a second', () => {
    const { result } = play({
      getDurationMs: (index) => (index === 0 ? 2000 : 10),
    });
    expect(result.current.activeDurationMs).toBe(2000);

    pass(1000);
    expect(result.current.progress).toBeCloseTo(50);

    act(() => result.current.handleNext());
    // Ten milliseconds is too short to see: the bar takes half a second.
    expect(result.current.activeDurationMs).toBe(10);
    pass(250);
    expect(result.current.progress).toBeCloseTo(40);
  });

  it('stops while paused, by the person or from outside, and goes on after', () => {
    const { result, rerender } = play();

    act(() => result.current.setIsPaused(true));
    pass(2000);
    expect(result.current.progress).toBe(0);

    act(() => result.current.setIsPaused(false));
    rerender({ isPausedOverride: true });
    pass(2000);
    expect(result.current.progress).toBe(0);

    rerender({ isPausedOverride: false });
    pass(300);
    expect(result.current.progress).toBeCloseTo(30);
  });

  it('goes forward and back by hand, starting each story from the beginning', () => {
    const { result } = play();
    pass(400);

    act(() => result.current.handleNext());
    expect(result.current).toMatchObject({ currentIndex: 1, progress: 0 });

    act(() => result.current.handlePrev());
    expect(result.current.currentIndex).toBe(0);
    // There is nothing before the first one.
    act(() => result.current.handlePrev());
    expect(result.current.currentIndex).toBe(0);
  });

  it('answers the arrow keys and the space bar, except while paused from outside', () => {
    const { result, rerender } = play();

    press('ArrowRight');
    expect(result.current.currentIndex).toBe(1);
    press(' ');
    expect(result.current.currentIndex).toBe(2);
    press('ArrowLeft');
    expect(result.current.currentIndex).toBe(1);
    press('Enter');
    expect(result.current.currentIndex).toBe(1);

    rerender({ isPausedOverride: true });
    press('ArrowRight');
    expect(result.current.currentIndex).toBe(1);
  });

  describe('the sound of a story', () => {
    const withSound = () =>
      play({
        getAudioClip: (index) =>
          index === 0
            ? { url: 'https://cdn/song.mp3', startMs: 3000, windowMs: 2000 }
            : null,
      });

    it('plays from where the clip starts, and goes back there at the end of its window', () => {
      withSound();
      const [audio] = FakeAudio.made;

      expect(audio.src).toBe('https://cdn/song.mp3');
      expect(audio.loop).toBe(false);
      expect(audio.currentTime).toBe(3);
      expect(audio.play).toHaveBeenCalled();

      audio.currentTime = 4.9;
      audio.listeners.get('timeupdate')?.();
      expect(audio.currentTime).toBe(4.9);
      audio.currentTime = 5.1;
      audio.listeners.get('timeupdate')?.();
      expect(audio.currentTime).toBe(3);
    });

    it('is silenced and paused with the story', () => {
      const { result } = withSound();
      const [audio] = FakeAudio.made;

      act(() => result.current.setIsMuted(true));
      expect(audio.muted).toBe(true);

      act(() => result.current.setIsPaused(true));
      expect(audio.pause).toHaveBeenCalled();
    });

    it('stops when the story changes, and a story without sound plays none', () => {
      const { result } = withSound();
      const [audio] = FakeAudio.made;

      act(() => result.current.handleNext());

      expect(audio.pause).toHaveBeenCalled();
      expect(audio.src).toBe('');
      expect(FakeAudio.made).toHaveLength(1);
    });

    it('goes on showing the story when the sound cannot be played', async () => {
      const refused = vi.fn(() => Promise.reject(new Error('blocked')));
      vi.stubGlobal(
        'Audio',
        class extends FakeAudio {
          play = refused;
        },
      );

      const { result } = withSound();
      await act(async () => {
        await Promise.resolve();
      });
      pass(300);

      expect(refused).toHaveBeenCalled();
      expect(result.current.progress).toBeCloseTo(30);
    });
  });
});
