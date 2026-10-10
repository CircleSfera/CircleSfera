import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { logger } from '../../utils/logger';
import { VoicePlayer } from './VoicePlayer';

vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }));

// A stand-in for the browser's audio element. Playing and pausing answer
// with the events a real one fires.
class FakeAudio {
  static made: FakeAudio[] = [];
  static playFails = false;
  src: string;
  duration = Number.NaN;
  currentTime = 0;
  playbackRate = 1;
  onloadedmetadata?: () => void;
  ontimeupdate?: () => void;
  onplay?: () => void;
  onpause?: () => void;
  onended?: () => void;
  play = vi.fn(() => {
    if (FakeAudio.playFails) return Promise.reject(new Error('blocked'));
    this.onplay?.();
    return Promise.resolve();
  });
  pause = vi.fn(() => this.onpause?.());
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
}
const audio = () => FakeAudio.made[FakeAudio.made.length - 1];
const show = (props: object = {}) =>
  renderWithProviders(
    <VoicePlayer
      voiceUrl="https://cdn.test/voice.webm"
      durationSeconds={20}
      {...props}
    />,
  );
const toggle = (name = 'Play audio') => screen.getByRole('button', { name });
const position = () =>
  screen.getByRole('slider', { name: 'Position in the audio' });
const speed = () => screen.getByRole('button', { name: /Playback speed/ });
const filled = () => document.querySelectorAll('[data-filled="true"]').length;
// The waveform measures 200 wide and starts at 100.
const pressAt = (clientX: number) => {
  vi.spyOn(position(), 'getBoundingClientRect').mockReturnValue({
    left: 100,
    width: 200,
  } as DOMRect);
  fireEvent.click(position(), { clientX });
};

describe('VoicePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeAudio.made = [];
    FakeAudio.playFails = false;
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts stopped, showing the length sent with the message', () => {
    show();

    expect(audio().src).toBe('https://cdn.test/voice.webm');
    expect(toggle()).toBeInTheDocument();
    expect(screen.getByText('0:20')).toBeInTheDocument();
    expect(position()).toHaveAttribute('aria-valuemax', '20');
    expect(position()).toHaveAttribute('aria-valuenow', '0');
    expect(speed()).toHaveTextContent('1x');
  });

  it('draws the waveform of the message, or a stock one when it has none', () => {
    const { unmount } = show({ waveform: [0, 0.5, 1, 4] });
    const heights = [...position().children].map(
      (bar) => (bar as HTMLElement).style.height,
    );
    // Never thinner than 4 px nor taller than 24.
    expect(heights).toEqual(['4px', '12px', '24px', '24px']);
    unmount();

    show({ waveform: [] });
    expect(position().children).toHaveLength(20);
  });

  it('takes the length of the audio once it is known', () => {
    show();

    act(() => {
      audio().duration = 31.6;
      audio().onloadedmetadata?.();
    });

    expect(screen.getByText('0:32')).toBeInTheDocument();
  });

  it('keeps the length sent with the message when the recording does not know its own', () => {
    show();

    act(() => {
      audio().duration = Number.POSITIVE_INFINITY;
      audio().onloadedmetadata?.();
    });
    expect(screen.getByText('0:20')).toBeInTheDocument();

    act(() => {
      audio().duration = Number.NaN;
      audio().onloadedmetadata?.();
    });
    expect(screen.getByText('0:20')).toBeInTheDocument();
  });

  it('shows no length rather than a broken one when none is known', () => {
    show({ durationSeconds: undefined });

    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('plays and pauses, the button saying what pressing it does', () => {
    show();

    fireEvent.click(toggle());
    expect(audio().play).toHaveBeenCalledTimes(1);
    expect(toggle('Pause audio')).toBeInTheDocument();

    fireEvent.click(toggle('Pause audio'));
    expect(audio().pause).toHaveBeenCalledTimes(1);
    expect(toggle()).toBeInTheDocument();
  });

  it('stays stopped, and records it, when the browser refuses to play', async () => {
    FakeAudio.playFails = true;
    show();

    fireEvent.click(toggle());

    await waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        'Voice message playback failed',
        expect.any(Error),
      ),
    );
    expect(toggle()).toBeInTheDocument();
  });

  it('follows the audio as it plays, filling the waveform', () => {
    show();
    expect(filled()).toBe(1);

    act(() => {
      audio().currentTime = 10;
      audio().ontimeupdate?.();
    });

    expect(screen.getByText('0:10')).toBeInTheDocument();
    expect(position()).toHaveAttribute('aria-valuenow', '10');
    expect(position()).toHaveAttribute('aria-valuetext', '0:10');
    expect(filled()).toBe(11);
  });

  it('goes back to the start, stopped, when the audio ends', () => {
    show();
    fireEvent.click(toggle());
    act(() => {
      audio().currentTime = 20;
      audio().ontimeupdate?.();
    });

    act(() => audio().onended?.());

    expect(toggle()).toBeInTheDocument();
    expect(screen.getByText('0:20')).toBeInTheDocument();
    expect(position()).toHaveAttribute('aria-valuenow', '0');
  });

  it('moves to where the waveform is pressed', () => {
    show();

    pressAt(250);

    expect(audio().currentTime).toBe(15);
    expect(screen.getByText('0:15')).toBeInTheDocument();
  });

  it('moves with the keys, never past either end', () => {
    show();

    fireEvent.keyDown(position(), { key: 'ArrowRight' });
    fireEvent.keyDown(position(), { key: 'ArrowUp' });
    expect(audio().currentTime).toBe(2);
    fireEvent.keyDown(position(), { key: 'ArrowLeft' });
    expect(audio().currentTime).toBe(1);
    fireEvent.keyDown(position(), { key: 'ArrowDown' });
    fireEvent.keyDown(position(), { key: 'ArrowDown' });
    expect(audio().currentTime).toBe(0);
    fireEvent.keyDown(position(), { key: 'End' });
    expect(audio().currentTime).toBe(20);
    fireEvent.keyDown(position(), { key: 'ArrowRight' });
    expect(audio().currentTime).toBe(20);
    fireEvent.keyDown(position(), { key: 'Home' });
    expect(audio().currentTime).toBe(0);
    fireEvent.keyDown(position(), { key: 'a' });
    expect(audio().currentTime).toBe(0);
  });

  it('moves nowhere while the length is unknown', () => {
    show({ durationSeconds: 0 });

    pressAt(250);
    fireEvent.keyDown(position(), { key: 'ArrowRight' });

    expect(audio().currentTime).toBe(0);
  });

  it('goes through the three speeds, and plays at the one chosen', () => {
    show();

    fireEvent.click(speed());
    expect(speed()).toHaveAccessibleName('Playback speed, now 1.5x');
    expect(audio().playbackRate).toBe(1.5);
    fireEvent.click(speed());
    expect(audio().playbackRate).toBe(2);

    fireEvent.click(toggle());
    expect(audio().playbackRate).toBe(2);

    fireEvent.click(speed());
    expect(speed()).toHaveTextContent('1x');
    expect(audio().playbackRate).toBe(1);
  });

  it('stops the audio when the message goes away, and starts afresh for another message', () => {
    const { rerender, unmount } = show();
    const first = audio();

    rerender(
      <VoicePlayer
        voiceUrl="https://cdn.test/other.webm"
        durationSeconds={5}
      />,
    );
    expect(first.pause).toHaveBeenCalled();
    expect(audio().src).toBe('https://cdn.test/other.webm');

    const second = audio();
    unmount();
    expect(second.pause).toHaveBeenCalled();
  });

  it('gives its controls the size of a finger, and one stop for the waveform', () => {
    show();

    expect(toggle()).toHaveClass('w-11', 'h-11');
    expect(speed()).toHaveClass('min-h-11', 'min-w-11');
    expect(position()).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
