import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import AudioPlayer from '../chat/AudioPlayer';
import { VoicePlayer } from './VoicePlayer';

/** Stand-in for the sound of a voice note, driven by hand. */
class FakeAudio {
  static last: FakeAudio;
  static playFails = false;
  src: string;
  duration = Number.NaN;
  currentTime = 0;
  playbackRate = 1;
  paused = true;
  onloadedmetadata: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onended: (() => void) | null = null;
  play = vi.fn(() => {
    if (FakeAudio.playFails) return Promise.reject(new Error('not allowed'));
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  constructor(src: string) {
    this.src = src;
    FakeAudio.last = this;
  }
  loaded(duration: number) {
    this.duration = duration;
    act(() => this.onloadedmetadata?.());
  }
  at(time: number) {
    this.currentTime = time;
    act(() => this.ontimeupdate?.());
  }
  ended() {
    act(() => this.onended?.());
  }
}

describe('VoicePlayer', () => {
  beforeEach(() => {
    FakeAudio.playFails = false;
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  const show = (props: Partial<Parameters<typeof VoicePlayer>[0]> = {}) =>
    renderWithProviders(
      <VoicePlayer
        voiceUrl="https://cdn.example/v.webm"
        durationSeconds={75}
        {...props}
      />,
    );
  const play = () => screen.getByRole('button', { name: 'Play audio' });
  const bars = () => screen.getAllByRole('button', { name: /^Jump to/ });

  it('shows the length sent with the message before anything is played', () => {
    show();
    expect(FakeAudio.last.src).toBe('https://cdn.example/v.webm');
    expect(screen.getByText('1:15')).toBeInTheDocument();
    expect(play()).toBeInTheDocument();
  });

  it('takes the length of the file when the file has one', () => {
    show();
    FakeAudio.last.loaded(9.6);
    expect(screen.getByText('0:10')).toBeInTheDocument();
  });

  it.each([
    [
      'endless, as a recording made in the browser reports',
      Number.POSITIVE_INFINITY,
    ],
    ['unknown', Number.NaN],
    ['zero', 0],
  ])(
    'keeps the length sent with the message when the file says it is %s',
    (_what, reported) => {
      show();
      FakeAudio.last.loaded(reported);
      expect(screen.getByText('1:15')).toBeInTheDocument();
    },
  );

  it('plays and pauses, and shows the time gone by', async () => {
    show();

    fireEvent.click(play());
    const pause = await screen.findByRole('button', { name: 'Pause audio' });
    expect(FakeAudio.last.play).toHaveBeenCalledTimes(1);

    FakeAudio.last.at(12.4);
    expect(screen.getByText('0:12')).toBeInTheDocument();

    fireEvent.click(pause);
    expect(FakeAudio.last.pause).toHaveBeenCalled();
    expect(play()).toBeInTheDocument();
  });

  it('stays ready to play when the browser refuses to', async () => {
    FakeAudio.playFails = true;
    show();

    fireEvent.click(play());
    await act(async () => {});

    expect(play()).toBeInTheDocument();
  });

  it('goes back to the start when the note ends', async () => {
    show();
    fireEvent.click(play());
    await screen.findByRole('button', { name: 'Pause audio' });
    FakeAudio.last.at(70);

    FakeAudio.last.ended();

    expect(play()).toBeInTheDocument();
    expect(screen.getByText('1:15')).toBeInTheDocument();
  });

  it('goes through the three speeds, also while playing', async () => {
    show();
    const speed = () => screen.getByRole('button', { name: /^Playback speed/ });
    expect(speed()).toHaveTextContent('1x');

    fireEvent.click(speed());
    expect(speed()).toHaveTextContent('1.5x');
    expect(FakeAudio.last.playbackRate).toBe(1.5);

    fireEvent.click(speed());
    expect(FakeAudio.last.playbackRate).toBe(2);
    expect(speed()).toHaveAccessibleName('Playback speed: 2x');

    fireEvent.click(speed());
    expect(FakeAudio.last.playbackRate).toBe(1);
  });

  it('starts at the chosen speed', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /^Playback speed/ }));
    FakeAudio.last.playbackRate = 1;

    fireEvent.click(play());
    await screen.findByRole('button', { name: 'Pause audio' });

    expect(FakeAudio.last.playbackRate).toBe(1.5);
  });

  it('draws the shape of the note and jumps to the bar that is pressed', () => {
    show({ waveform: [0.1, 0.5, 1, 0.5], durationSeconds: 40 });
    expect(bars()).toHaveLength(4);
    expect(bars()[2]).toHaveAccessibleName('Jump to 0:20');

    fireEvent.click(bars()[2]);

    expect(FakeAudio.last.currentTime).toBe(20);
    expect(screen.getByText('0:20')).toBeInTheDocument();
  });

  it('draws a plain shape for a note that came without one, and leaves the bars out of the Tab order', () => {
    show({ waveform: [] });
    expect(bars()).toHaveLength(20);
    for (const bar of bars()) expect(bar).toHaveAttribute('tabindex', '-1');
  });

  it('does not jump while the length is unknown', () => {
    show({ durationSeconds: 0 });
    fireEvent.click(bars()[5]);
    expect(FakeAudio.last.currentTime).toBe(0);
  });

  it('stops the sound when the message goes away, and loads the new one when the note changes', () => {
    const { rerender, unmount } = show();
    const first = FakeAudio.last;

    rerender(<VoicePlayer voiceUrl="https://cdn.example/other.webm" />);
    expect(first.pause).toHaveBeenCalled();
    expect(FakeAudio.last.src).toBe('https://cdn.example/other.webm');

    const second = FakeAudio.last;
    unmount();
    expect(second.pause).toHaveBeenCalled();
  });

  it('names its controls in Spanish too', () => {
    renderWithProviders(
      <VoicePlayer voiceUrl="x" durationSeconds={10} waveform={[0.5, 0.5]} />,
      { lng: 'es' },
    );
    expect(
      screen.getByRole('button', { name: 'Reproducir audio' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Saltar a 0:05' }),
    ).toBeInTheDocument();
  });
});

describe('AudioPlayer', () => {
  const playSpy = vi.fn();
  const pauseSpy = vi.fn();
  let playResult: Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    playResult = Promise.resolve();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      playSpy();
      return playResult;
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pauseSpy);
  });
  afterEach(() => vi.restoreAllMocks());

  function show() {
    const view = renderWithProviders(
      <AudioPlayer src="https://cdn.example/a.mp3" />,
    );
    const audio = view.container.querySelector('audio') as HTMLAudioElement;
    const set = (name: 'duration' | 'currentTime', value: number) =>
      Object.defineProperty(audio, name, {
        configurable: true,
        writable: true,
        value,
      });
    return { audio, set, ...view };
  }
  const play = () => screen.getByRole('button', { name: 'Play audio' });
  const position = () =>
    screen.getByRole('slider', { name: 'Position in the audio' });

  it('shows the length once the file is read', () => {
    const { audio, set } = show();
    expect(audio.src).toBe('https://cdn.example/a.mp3');
    expect(screen.getAllByText('0:00')).toHaveLength(2);

    set('duration', 125);
    fireEvent.loadedMetadata(audio);

    expect(screen.getByText('2:05')).toBeInTheDocument();
    expect(position()).toHaveAttribute('max', '125');
  });

  it('shows an unknown length as zero instead of "Infinity"', () => {
    const { audio, set } = show();
    set('duration', Number.POSITIVE_INFINITY);
    fireEvent.loadedMetadata(audio);

    expect(screen.getAllByText('0:00')).toHaveLength(2);
    expect(screen.queryByText(/Infinity|NaN/)).not.toBeInTheDocument();
  });

  it('follows what the sound does: playing, paused and ended', () => {
    const { audio } = show();

    fireEvent.click(play());
    expect(playSpy).toHaveBeenCalledTimes(1);
    fireEvent.play(audio);
    const pause = screen.getByRole('button', { name: 'Pause audio' });

    fireEvent.click(pause);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    fireEvent.pause(audio);
    expect(play()).toBeInTheDocument();

    fireEvent.play(audio);
    fireEvent.ended(audio);
    expect(play()).toBeInTheDocument();
  });

  it('stays ready to play when the browser cannot play the file', async () => {
    playResult = Promise.reject(new Error('NotSupportedError'));
    show();

    fireEvent.click(play());
    await act(async () => {});

    expect(play()).toBeInTheDocument();
  });

  it('shows the time gone by and moves to where the slider is put', () => {
    const { audio, set } = show();
    set('duration', 100);
    fireEvent.loadedMetadata(audio);

    set('currentTime', 42);
    fireEvent.timeUpdate(audio);
    expect(screen.getByText('0:42')).toBeInTheDocument();

    fireEvent.change(position(), { target: { value: '65' } });
    expect(audio.currentTime).toBe(65);
    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('goes through the three speeds', () => {
    const { audio } = show();
    const speed = () => screen.getByRole('button', { name: /^Playback speed/ });

    fireEvent.click(speed());
    expect(audio.playbackRate).toBe(1.5);
    fireEvent.click(speed());
    expect(audio.playbackRate).toBe(2);
    expect(speed()).toHaveTextContent('2x');
    fireEvent.click(speed());
    expect(audio.playbackRate).toBe(1);
  });

  it('stops listening when the message goes away', () => {
    const { audio, unmount } = show();
    const remove = vi.spyOn(audio, 'removeEventListener');
    unmount();
    expect(remove.mock.calls.map(([name]) => name).sort()).toEqual([
      'ended',
      'loadedmetadata',
      'pause',
      'play',
      'timeupdate',
    ]);
  });
});
