import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioApi } from '../../services/audio.service';
import { renderWithProviders } from '../../test/test-utils';
import MusicSubScreen from './MusicSubScreen';

vi.mock('../../services/audio.service', () => ({
  audioApi: { getTrending: vi.fn(), search: vi.fn() },
}));

const track = {
  id: 'audio-1',
  title: 'Canción uno',
  artist: 'Artista uno',
  url: 'https://cdn.example.com/audio.mp3',
  duration: 30,
  thumbnailUrl: null,
  usageCount: 10,
};

function renderMusic() {
  return renderWithProviders(
    <MusicSubScreen onClose={vi.fn()} onSelectAudio={vi.fn()} />,
    { lng: 'es' },
  );
}

describe('Music screen states', () => {
  beforeEach(() => {
    vi.mocked(audioApi.getTrending).mockReset();
    vi.mocked(audioApi.search).mockReset();
  });

  it('says there is no music when the list comes back empty', async () => {
    vi.mocked(audioApi.getTrending).mockResolvedValue({ data: [] } as never);
    renderMusic();

    expect(
      await screen.findByText('No hay audios disponibles.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the music could not load, not that there is none, and loads it on retry', async () => {
    vi.mocked(audioApi.getTrending).mockRejectedValue(new Error('down'));
    renderMusic();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar la música.');
    expect(
      screen.queryByText('No hay audios disponibles.'),
    ).not.toBeInTheDocument();

    vi.mocked(audioApi.getTrending).mockResolvedValue({
      data: [track],
    } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Canción uno')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports a failed search as a failure and searches again on retry', async () => {
    vi.mocked(audioApi.getTrending).mockResolvedValue({ data: [] } as never);
    vi.mocked(audioApi.search).mockRejectedValue(new Error('down'));
    renderMusic();

    fireEvent.change(
      screen.getByPlaceholderText('Buscar por canción o artista…'),
      { target: { value: 'uno' } },
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la música.',
    );

    vi.mocked(audioApi.search).mockResolvedValue({ data: [] } as never);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() =>
      expect(
        screen.getByText('No se encontraron resultados.'),
      ).toBeInTheDocument(),
    );
  });
});

describe('Location screen states', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'test-token');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function renderLocation() {
    const { default: LocationSubScreen } = await import('./LocationSubScreen');
    renderWithProviders(
      <LocationSubScreen onClose={vi.fn()} onSelect={vi.fn()} />,
      { lng: 'es' },
    );
    fireEvent.change(screen.getByPlaceholderText('Buscar ubicación...'), {
      target: { value: 'Madrid' },
    });
  }

  it('says no place was found when the search returns nothing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });
    await renderLocation();

    expect(screen.getByText('Buscando...')).toBeInTheDocument();
    expect(
      await screen.findByText('No se encontraron ubicaciones'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the search failed, not that nothing was found, and searches again on retry', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await renderLocation();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron buscar lugares.',
    );
    expect(
      screen.queryByText('No se encontraron ubicaciones'),
    ).not.toBeInTheDocument();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          { mapbox_id: 'p1', name: 'Madrid', place_formatted: 'España' },
        ],
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('España')).toBeInTheDocument();
  });

  it('clears the search with a named button', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    });
    await renderLocation();

    fireEvent.click(screen.getByRole('button', { name: 'Borrar búsqueda' }));

    expect(screen.getByPlaceholderText('Buscar ubicación...')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Usar Ubicación Actual' }),
    ).toBeInTheDocument();
  });
});
