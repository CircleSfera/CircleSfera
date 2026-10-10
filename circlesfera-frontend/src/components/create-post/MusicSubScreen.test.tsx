import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioApi } from '../../services/audio.service';
import { renderWithProviders } from '../../test/test-utils';
import MusicSubScreen from './MusicSubScreen';

type Props = Record<string, any>;

/** The props the wave of the clip last received. */
const wave = vi.hoisted(() => ({ props: {} as Record<string, any> }));

vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);
vi.mock('../../services/audio.service', () => ({
  audioApi: { getTrending: vi.fn(), search: vi.fn() },
}));
vi.mock('../audio/AudioClipWaveform', () => ({
  default: (props: Props) => {
    wave.props = props;
    return <div data-testid="wave" />;
  },
}));

const track = (id: string, more = {}) => ({
  id,
  title: `Song ${id}`,
  artist: 'Ana',
  url: `https://cdn/${id}.mp3`,
  duration: 60,
  ...more,
});

/** Every sound the screen starts, with what was done to it. */
let sounds: {
  src: string;
  currentTime: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  onended?: () => void;
  ontimeupdate?: () => void;
  onpause?: () => void;
}[];

function show(more: Props = {}) {
  const onSelectAudio = vi.fn();
  const onClose = vi.fn();
  const view = renderWithProviders(
    <MusicSubScreen
      onSelectAudio={onSelectAudio}
      onClose={onClose}
      {...more}
    />,
  );
  return { onSelectAudio, onClose, ...view };
}

const rowOf = (title: string) =>
  screen.getByText(title).closest('.group') as HTMLElement;
const useTrack = (title: string) =>
  fireEvent.click(
    [...rowOf(title).querySelectorAll('button')].at(-1) as HTMLElement,
  );

describe('MusicSubScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sounds = [];
    vi.stubGlobal(
      'Audio',
      vi.fn(function Audio(this: unknown, src: string) {
        const sound = {
          src,
          currentTime: 0,
          play: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn(),
        };
        sounds.push(sound);
        return sound;
      }),
    );
    vi.mocked(audioApi.getTrending).mockResolvedValue({
      data: [track('a'), track('b', { artist: null })],
    } as never);
    vi.mocked(audioApi.search).mockResolvedValue({
      data: [track('found')],
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('the list', () => {
    it('shows the tracks in fashion, with who they are by', async () => {
      show();

      expect(await screen.findByText('Song a')).toBeInTheDocument();
      expect(screen.getByText('Unknown artist')).toBeInTheDocument();
      expect(audioApi.search).not.toHaveBeenCalled();
    });

    it('searches by what is typed', async () => {
      show();
      await screen.findByText('Song a');

      fireEvent.change(
        screen.getByPlaceholderText('Search by song or artist…'),
        {
          target: { value: 'found' },
        },
      );

      expect(await screen.findByText('Song found')).toBeInTheDocument();
      expect(audioApi.search).toHaveBeenCalledWith('found');
    });

    it('says so when nothing matches, and when there is no music at all', async () => {
      vi.mocked(audioApi.getTrending).mockResolvedValue({ data: [] } as never);
      vi.mocked(audioApi.search).mockResolvedValue({ data: [] } as never);
      show();
      expect(
        await screen.findByText('No audio tracks available.'),
      ).toBeInTheDocument();

      fireEvent.change(
        screen.getByPlaceholderText('Search by song or artist…'),
        {
          target: { value: 'zzz' },
        },
      );

      expect(await screen.findByText('No results found.')).toBeInTheDocument();
    });

    it('offers to try again when the music cannot be loaded', async () => {
      vi.mocked(audioApi.getTrending).mockRejectedValueOnce(new Error('down'));
      show();
      expect(
        await screen.findByText('Could not load the music.'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

      expect(await screen.findByText('Song a')).toBeInTheDocument();
    });

    it('plays one track at a time', async () => {
      show();
      await screen.findByText('Song a');

      fireEvent.click(
        rowOf('Song a').querySelector(
          '[aria-label="Play preview"]',
        ) as HTMLElement,
      );
      expect(sounds[0].src).toBe('https://cdn/a.mp3');
      expect(sounds[0].play).toHaveBeenCalledTimes(1);

      fireEvent.click(
        rowOf('Song b').querySelector(
          '[aria-label="Play preview"]',
        ) as HTMLElement,
      );
      expect(sounds[0].pause).toHaveBeenCalledTimes(1);
      expect(sounds[1].src).toBe('https://cdn/b.mp3');

      fireEvent.click(
        rowOf('Song b').querySelector(
          '[aria-label="Pause preview"]',
        ) as HTMLElement,
      );
      expect(sounds[1].pause).toHaveBeenCalledTimes(1);
    });

    it('shows play again when a track has been heard to the end', async () => {
      show();
      await screen.findByText('Song a');
      fireEvent.click(
        rowOf('Song a').querySelector(
          '[aria-label="Play preview"]',
        ) as HTMLElement,
      );

      act(() => sounds[0].onended?.());

      expect(
        rowOf('Song a').querySelector('[aria-label="Play preview"]'),
      ).not.toBeNull();
    });

    it('stops the track being heard when the screen is left', async () => {
      const { unmount } = show();
      await screen.findByText('Song a');
      fireEvent.click(
        rowOf('Song a').querySelector(
          '[aria-label="Play preview"]',
        ) as HTMLElement,
      );

      unmount();

      expect(sounds[0].pause).toHaveBeenCalled();
    });

    it('takes the music off the post', async () => {
      const { onSelectAudio, onClose } = show({ selectedAudioId: 'a' });
      await screen.findByText('Song a');

      fireEvent.click(
        screen.getByRole('button', { name: 'Remove selected music' }),
      );

      expect(onSelectAudio).toHaveBeenCalledWith(null);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not offer taking music off when none is chosen', async () => {
      show();
      await screen.findByText('Song a');

      expect(
        screen.queryByRole('button', { name: 'Remove selected music' }),
      ).toBeNull();
    });
  });

  describe('choosing the part of a track', () => {
    it('opens on the start of the track, with as much as fits the media', async () => {
      show({ clipWindowMs: 20_000 });
      await screen.findByText('Song a');

      useTrack('Song a');

      expect(screen.getByText('Choose clip')).toBeInTheDocument();
      expect(wave.props).toMatchObject({
        url: 'https://cdn/a.mp3',
        trackDurationMs: 60_000,
        windowMs: 20_000,
        startMs: 0,
        maxStartMs: 40_000,
        disabled: false,
      });
    });

    it('opens the track already in use where its clip started', async () => {
      show({ selectedAudioId: 'a', selectedAudioStartMs: 12_000 });
      await screen.findByText('Song a');

      useTrack('Song a');

      expect(wave.props.startMs).toBe(12_000);
    });

    it('never takes more than the track has', async () => {
      vi.mocked(audioApi.getTrending).mockResolvedValue({
        data: [track('short', { duration: 8 })],
      } as never);
      show({ clipWindowMs: 20_000 });
      await screen.findByText('Song short');

      useTrack('Song short');

      expect(wave.props).toMatchObject({
        windowMs: 8000,
        maxStartMs: 0,
        disabled: true,
      });
    });

    it('uses the clip from where it was moved to', async () => {
      const { onSelectAudio, onClose } = show();
      await screen.findByText('Song a');
      useTrack('Song a');

      act(() => wave.props.onStartMsChange(7300.4));
      fireEvent.click(screen.getByRole('button', { name: 'Use this clip' }));

      expect(onSelectAudio).toHaveBeenCalledWith({
        audio: expect.objectContaining({ id: 'a' }),
        audioStartMs: 7300,
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('plays the clip from its start and stops when it has been heard', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      show({ clipWindowMs: 10_000 });
      await screen.findByText('Song a');
      useTrack('Song a');
      act(() => wave.props.onStartMsChange(5000));

      fireEvent.click(screen.getByRole('button', { name: 'Preview clip' }));

      expect(sounds[0].currentTime).toBe(5);
      expect(sounds[0].play).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('button', { name: 'Pause preview' }),
      ).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(sounds[0].pause).toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Preview clip' }),
      ).toBeInTheDocument();
    });

    it('stops the clip when it is moved, and when it is paused', async () => {
      show();
      await screen.findByText('Song a');
      useTrack('Song a');
      fireEvent.click(screen.getByRole('button', { name: 'Preview clip' }));

      act(() => wave.props.onStartMsChange(3000));
      expect(sounds[0].pause).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Preview clip' }));
      fireEvent.click(screen.getByRole('button', { name: 'Pause preview' }));
      expect(sounds.at(-1)?.pause).toHaveBeenCalled();
    });

    it('goes back to the list, not out of the screen, and stops the clip', async () => {
      const { onClose } = show();
      await screen.findByText('Song a');
      useTrack('Song a');
      fireEvent.click(screen.getByRole('button', { name: 'Preview clip' }));

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(onClose).not.toHaveBeenCalled();
      expect(sounds[0].pause).toHaveBeenCalled();
      expect(await screen.findByText('Song a')).toBeInTheDocument();
    });

    it('stops the clip being heard when the screen is left', async () => {
      const { unmount } = show();
      await screen.findByText('Song a');
      useTrack('Song a');
      fireEvent.click(screen.getByRole('button', { name: 'Preview clip' }));

      unmount();

      expect(sounds[0].pause).toHaveBeenCalled();
    });
  });

  it('leaves from the back arrow of the list', async () => {
    const { onClose } = show();
    await screen.findByText('Song a');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
