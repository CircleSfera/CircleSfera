import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../utils/logger';
import AudioPlayer from './AudioPlayer';

vi.mock('../../utils/logger', () => ({ logger: { error: vi.fn() } }));

// The test browser has no audio engine: play and pause are stood in for, and
// answer with the events a real element fires.
const play = vi.fn();
const pause = vi.fn();
const element = () => document.querySelector('audio') as HTMLAudioElement;
const fire = (name: string) =>
  act(() => void element().dispatchEvent(new Event(name)));
const lengthIs = (seconds: number) => {
  Object.defineProperty(element(), 'duration', {
    configurable: true,
    value: seconds,
  });
  fire('loadedmetadata');
};
const show = () => render(<AudioPlayer src="https://cdn.test/voice.webm" />);
const toggle = (name = 'Play audio') => screen.getByRole('button', { name });
const position = () =>
  screen.getByRole('slider', { name: 'Position in the audio' });

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    play.mockImplementation(function (this: HTMLAudioElement) {
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    pause.mockImplementation(function (this: HTMLAudioElement) {
      this.dispatchEvent(new Event('pause'));
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
  });
  afterEach(() => vi.restoreAllMocks());

  it('starts stopped, at the beginning, at normal speed', () => {
    show();

    expect(element()).toHaveAttribute('src', 'https://cdn.test/voice.webm');
    expect(toggle()).toBeInTheDocument();
    expect(screen.getAllByText('0:00')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Playback speed, now 1x' }),
    ).toHaveTextContent('1x');
  });

  it('shows the length once the audio says it', () => {
    show();

    lengthIs(75);

    expect(screen.getByText('1:15')).toBeInTheDocument();
    expect(position()).toHaveAttribute('max', '75');
  });

  it('shows no length for a recording that does not know its own', () => {
    show();

    lengthIs(Number.POSITIVE_INFINITY);
    expect(screen.getAllByText('0:00')).toHaveLength(2);

    lengthIs(Number.NaN);
    expect(screen.getAllByText('0:00')).toHaveLength(2);
  });

  it('takes the length when it becomes known later', () => {
    show();
    lengthIs(Number.POSITIVE_INFINITY);

    Object.defineProperty(element(), 'duration', {
      configurable: true,
      value: 9,
    });
    fire('durationchange');

    expect(screen.getByText('0:09')).toBeInTheDocument();
  });

  it('plays and pauses, the button saying what pressing it does', async () => {
    show();

    fireEvent.click(toggle());
    expect(play).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', { name: 'Pause audio' }),
    ).toBeInTheDocument();

    fireEvent.click(toggle('Pause audio'));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(toggle()).toBeInTheDocument();
  });

  it('stays stopped, and records it, when the browser refuses to play', async () => {
    play.mockImplementation(() => Promise.reject(new Error('not allowed')));
    show();

    fireEvent.click(toggle());

    await waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        'Audio playback failed',
        expect.any(Error),
      ),
    );
    expect(toggle()).toBeInTheDocument();
  });

  it('follows the audio as it plays, and stops at the end', async () => {
    show();
    lengthIs(75);
    fireEvent.click(toggle());

    element().currentTime = 61;
    fire('timeupdate');
    expect(screen.getByText('1:01')).toBeInTheDocument();
    expect(position()).toHaveValue('61');
    expect(position()).toHaveAttribute('aria-valuetext', '1:01');

    fire('ended');
    expect(toggle()).toBeInTheDocument();
  });

  it('moves the audio to where the person drags', () => {
    show();
    lengthIs(75);

    fireEvent.change(position(), { target: { value: '30' } });

    expect(element().currentTime).toBe(30);
    expect(screen.getByText('0:30')).toBeInTheDocument();
  });

  it('goes through the three speeds and back', () => {
    show();
    const speed = () => screen.getByRole('button', { name: /Playback speed/ });

    fireEvent.click(speed());
    expect(speed()).toHaveTextContent('1.5x');
    expect(element().playbackRate).toBe(1.5);
    fireEvent.click(speed());
    expect(speed()).toHaveAccessibleName('Playback speed, now 2x');
    expect(element().playbackRate).toBe(2);
    fireEvent.click(speed());
    expect(element().playbackRate).toBe(1);
  });

  it('gives its controls the size of a finger', () => {
    show();

    expect(toggle()).toHaveClass('w-11', 'h-11');
    expect(screen.getByRole('button', { name: /Playback speed/ })).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
  });

  it('stops listening to the audio when it goes away', () => {
    const { unmount } = show();
    const audio = element();
    const removed = vi.spyOn(audio, 'removeEventListener');

    unmount();

    expect(removed.mock.calls.map(([name]) => name).sort()).toEqual([
      'durationchange',
      'ended',
      'loadedmetadata',
      'pause',
      'play',
      'timeupdate',
    ]);
  });
});
