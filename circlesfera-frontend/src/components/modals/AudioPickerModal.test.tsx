import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audioApi } from '../../services/audio.service';
import { renderWithProviders } from '../../test/test-utils';
import type { Audio } from '../../types';
import AudioPickerModal from './AudioPickerModal';

vi.mock('../../services/audio.service', () => ({
  audioApi: {
    getTrending: vi.fn(),
    search: vi.fn(),
  },
}));

const nightDrive: Audio = {
  id: 'audio-1',
  title: 'Night Drive',
  artist: 'Nova',
  url: 'https://cdn.example.com/night.mp3',
  duration: 120,
};

const loft: Audio = {
  id: 'audio-2',
  title: 'Loft',
  artist: '',
  url: 'https://cdn.example.com/loft.mp3',
  duration: 90,
};

describe('AudioPickerModal', () => {
  const onClose = vi.fn();
  const onSelectAudio = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(audioApi.getTrending).mockResolvedValue({
      data: [nightDrive, loft],
    } as never);
    vi.mocked(audioApi.search).mockResolvedValue({
      data: [nightDrive],
    } as never);
  });

  it('renders nothing when closed and does not fetch', () => {
    renderWithProviders(
      <AudioPickerModal
        isOpen={false}
        onClose={onClose}
        onSelectAudio={onSelectAudio}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(audioApi.getTrending).not.toHaveBeenCalled();
    expect(audioApi.search).not.toHaveBeenCalled();
  });

  it('lists trending tracks and closes without selecting', async () => {
    renderWithProviders(
      <AudioPickerModal
        isOpen
        onClose={onClose}
        onSelectAudio={onSelectAudio}
      />,
    );

    expect(await screen.findByText('Night Drive')).toBeInTheDocument();
    expect(screen.getByText('Nova')).toBeInTheDocument();
    expect(screen.getByText('Unknown artist')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelectAudio).not.toHaveBeenCalled();
  });

  it('selects a track and closes', async () => {
    renderWithProviders(
      <AudioPickerModal
        isOpen
        onClose={onClose}
        onSelectAudio={onSelectAudio}
      />,
    );

    await screen.findByText('Night Drive');
    fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]);

    expect(onSelectAudio).toHaveBeenCalledWith(nightDrive);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clears the current selection', async () => {
    renderWithProviders(
      <AudioPickerModal
        isOpen
        onClose={onClose}
        onSelectAudio={onSelectAudio}
        selectedAudioId="audio-1"
      />,
    );

    await screen.findByText('Night Drive');
    expect(
      screen.getByRole('button', { name: 'Selected' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove selected music' }),
    );

    expect(onSelectAudio).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('searches when the query is not empty', async () => {
    renderWithProviders(
      <AudioPickerModal
        isOpen
        onClose={onClose}
        onSelectAudio={onSelectAudio}
      />,
    );

    await screen.findByText('Night Drive');
    fireEvent.change(screen.getByPlaceholderText('Search by song or artist…'), {
      target: { value: 'night' },
    });

    await waitFor(() => {
      expect(audioApi.search).toHaveBeenCalledWith('night');
    });
    expect(await screen.findByText('Night Drive')).toBeInTheDocument();
    expect(screen.queryByText('Loft')).not.toBeInTheDocument();
  });

  it('plays and pauses a preview', async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    vi.stubGlobal(
      'Audio',
      vi.fn(function AudioMock() {
        return { play, pause, onended: null };
      }),
    );

    renderWithProviders(
      <AudioPickerModal
        isOpen
        onClose={onClose}
        onSelectAudio={onSelectAudio}
      />,
    );

    await screen.findByText('Night Drive');
    fireEvent.click(screen.getAllByRole('button', { name: 'Play preview' })[0]);
    expect(play).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Pause preview' }));
    expect(pause).toHaveBeenCalled();
  });
});
