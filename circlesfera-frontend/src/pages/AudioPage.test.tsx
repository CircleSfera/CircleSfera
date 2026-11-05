import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFrameAudio } from '../components/create-post/frameAudioStart';
import { audioApi } from '../services/audio.service';
import { renderWithProviders } from '../test/test-utils';
import AudioPage from './AudioPage';

vi.mock('../services/audio.service', () => ({
  audioApi: { getById: vi.fn(), getPosts: vi.fn() },
}));
vi.mock('../components/profile/PostGrid', () => ({
  default: ({
    items,
    emptyMessage,
  }: {
    items: { id: string }[];
    emptyMessage: string;
  }) => (
    <ul>
      {items.length === 0 ? (
        <li>{emptyMessage}</li>
      ) : (
        items.map((p) => <li key={p.id}>{p.id}</li>)
      )}
    </ul>
  ),
}));

const song = {
  id: 'a1',
  title: 'Summer',
  artist: 'Nia',
  url: '/s.mp3',
  duration: 30,
};

function CreateSpy() {
  const { state } = useLocation();
  return <p>create with {readFrameAudio(state)?.title ?? 'nothing'}</p>;
}

function open() {
  return renderWithProviders(
    <Routes>
      <Route path="/audio/:id" element={<AudioPage />} />
      <Route path="/create" element={<CreateSpy />} />
    </Routes>,
    { lng: 'en', routerProps: { initialEntries: ['/audio/a1'] } },
  );
}

describe('AudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(audioApi.getById).mockResolvedValue({ data: song } as never);
    vi.mocked(audioApi.getPosts).mockResolvedValue({
      data: {
        data: [{ id: 'f1' }, { id: 'f2' }],
        meta: { page: 1, totalPages: 1, total: 2 },
      },
    } as never);
  });

  it('shows the song, how many use it and the posts that do', async () => {
    open();
    expect(
      await screen.findByRole('heading', { name: 'Summer' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nia')).toBeInTheDocument();
    expect(await screen.findByText('2 posts')).toBeInTheDocument();
    expect(screen.getByText('f1')).toBeInTheDocument();
    expect(audioApi.getPosts).toHaveBeenCalledWith('a1', 1, 21);
  });

  it('opens a new Frame with the song chosen', async () => {
    open();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Use this audio' }),
    );
    expect(await screen.findByText('create with Summer')).toBeInTheDocument();
  });

  it('says nobody has used it yet, and when it could not be opened', async () => {
    vi.mocked(audioApi.getPosts).mockResolvedValue({
      data: { data: [], meta: { page: 1, totalPages: 0, total: 0 } },
    } as never);
    const first = open();
    expect(
      await screen.findByText('Nobody has used it yet'),
    ).toBeInTheDocument();
    first.unmount();

    vi.mocked(audioApi.getById).mockRejectedValue(new Error('gone'));
    open();
    expect(
      await screen.findByText('Could not open this audio'),
    ).toBeInTheDocument();
  });
});
