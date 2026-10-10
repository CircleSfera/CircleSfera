import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import LiveStreamsTab from './LiveStreamsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getLiveStreams: vi.fn(),
    endLiveStream: vi.fn(),
    getUserDetail: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock('../common/HlsVideoPlayer', () => ({
  default: ({ src }: { src: string }) => (
    <div data-testid="player" data-src={src} />
  ),
}));

const api = vi.mocked(adminApi);

let search = '';
function Where() {
  search = useLocation().search;
  return null;
}

const stream = (id: string, over: object = {}) => ({
  id,
  title: `Stream ${id}`,
  status: 'LIVE',
  viewerCount: 10,
  startedAt: '2026-03-10T11:00:00Z',
  endedAt: null,
  hlsUrl: `https://media.test/${id}.m3u8`,
  replayUrl: null,
  host: { id: `h-${id}`, profile: { username: `host_${id}`, avatar: null } },
  coHost: null,
  _count: { gifts: 4 },
  ...over,
});

const list = (rows: object[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length ? totalPages * 10 : 0,
      page: pageNumber,
      limit: 10,
      totalPages,
    },
  },
});

function show(entry = '/live', lng: 'en' | 'es' = 'en') {
  return renderWithProviders(
    <>
      <Where />
      <LiveStreamsTab />
    </>,
    { routerProps: { initialEntries: [entry], useTransitions: false }, lng },
  );
}

const rowOf = (title: string) =>
  screen
    .getAllByText(title)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const kpi = (title: string) =>
  screen.getByText(title).parentElement as HTMLElement;
const panel = () =>
  screen.getByRole('button', { name: 'Close' }).parentElement
    ?.parentElement as HTMLElement;

describe('LiveStreamsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = '';
    api.getLiveStreams.mockResolvedValue(list([]) as never);
    api.endLiveStream.mockResolvedValue({} as never);
  });

  it('asks for the broadcasts on air first and says when there are none', async () => {
    show();

    expect(await screen.findByText('No live streams')).toBeInTheDocument();
    expect(api.getLiveStreams).toHaveBeenCalledWith(1, 10, 'LIVE', undefined);
    expect(kpi('Active lives')).toHaveTextContent('0');
    expect(kpi('Total viewers')).toHaveTextContent('0');
  });

  it('shows placeholders while the list loads', () => {
    api.getLiveStreams.mockReturnValue(new Promise(() => {}));
    const { container } = show();

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('No live streams')).not.toBeInTheDocument();
  });

  it('adds up the broadcasts on air and their viewers', async () => {
    api.getLiveStreams.mockResolvedValue(
      list([
        stream('a', { viewerCount: 1200 }),
        stream('b', { viewerCount: 34 }),
        stream('c', { status: 'ENDED', viewerCount: 999 }),
      ]) as never,
    );
    show();

    await screen.findByText('Stream a');
    expect(kpi('Active lives')).toHaveTextContent('2');
    expect(kpi('Total viewers')).toHaveTextContent('1,234');
  });

  it('shows who hosts each one and offers to end only those on air', async () => {
    api.getLiveStreams.mockResolvedValue(
      list([
        stream('a', { viewerCount: 7 }),
        stream('b', { status: 'ENDED', viewerCount: 7 }),
        stream('c', { title: null, host: null, viewerCount: 0 }),
      ]) as never,
    );
    show();

    await screen.findByText('Stream a');
    const live = rowOf('Stream a');
    expect(within(live).getByText('@host_a')).toBeInTheDocument();
    expect(within(live).getByText('LIVE')).toHaveClass('text-red-400');
    expect(within(live).getByText('7')).toBeInTheDocument();
    expect(within(live).getByRole('button', { name: 'End' })).toBeEnabled();

    const ended = rowOf('Stream b');
    expect(within(ended).getByText('ENDED')).toHaveClass('text-white/50');
    expect(within(ended).queryByText('7')).not.toBeInTheDocument();
    expect(
      within(ended).queryByRole('button', { name: 'End' }),
    ).not.toBeInTheDocument();

    const unnamed = rowOf('Unknown');
    expect(within(unnamed).getByText('@Unknown')).toBeInTheDocument();
    expect(within(unnamed).getByText('0')).toBeInTheDocument();
  });

  it('asks again when the status changes, from the first page', async () => {
    api.getLiveStreams.mockImplementation((pageNumber = 1) =>
      Promise.resolve(list([stream(`p${pageNumber}`)], pageNumber, 3) as never),
    );
    show();
    await screen.findByText('Stream p1');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Stream p2')).toBeInTheDocument();
    expect(api.getLiveStreams).toHaveBeenLastCalledWith(
      2,
      10,
      'LIVE',
      undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ended' }));
    await waitFor(() =>
      expect(api.getLiveStreams).toHaveBeenLastCalledWith(
        1,
        10,
        'ENDED',
        undefined,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() =>
      expect(api.getLiveStreams).toHaveBeenLastCalledWith(
        1,
        10,
        undefined,
        undefined,
      ),
    );
  });

  it('shows every broadcast of one person when the list comes filtered by them', async () => {
    api.getUserDetail.mockResolvedValue({
      data: { profile: { username: 'ana' } },
    } as never);
    show('/live?userId=u1');

    await waitFor(() =>
      expect(api.getLiveStreams).toHaveBeenCalledWith(1, 10, undefined, 'u1'),
    );
    expect(await screen.findByText('Filtered by @ana')).toBeInTheDocument();
    expect(api.getUserDetail).toHaveBeenCalledWith('u1');

    fireEvent.click(screen.getByRole('button', { name: 'Clear user filter' }));

    await waitFor(() =>
      expect(api.getLiveStreams).toHaveBeenLastCalledWith(
        1,
        10,
        'LIVE',
        undefined,
      ),
    );
    expect(search).toBe('');
    expect(screen.queryByText(/Filtered by/)).not.toBeInTheDocument();
  });

  it('names the person generically until their handle is known', async () => {
    api.getUserDetail.mockReturnValue(new Promise(() => {}));
    show('/live?userId=u1');

    expect(await screen.findByText('Filtered by user')).toBeInTheDocument();
  });

  it('ends a broadcast only after confirming, then reads the list again', async () => {
    api.getLiveStreams.mockResolvedValue(list([stream('a')]) as never);
    show();
    await screen.findByText('Stream a');

    fireEvent.click(
      within(rowOf('Stream a')).getByRole('button', { name: 'End' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('End live')).toBeInTheDocument();
    expect(api.endLiveStream).not.toHaveBeenCalled();
    // Ending from the row does not open the broadcast.
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'End' }));

    await waitFor(() => expect(api.endLiveStream).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith('Live stream ended');
    expect(api.getLiveStreams).toHaveBeenCalledTimes(2);
  });

  it('ends nothing when the question is cancelled', async () => {
    api.getLiveStreams.mockResolvedValue(list([stream('a')]) as never);
    show();
    await screen.findByText('Stream a');

    fireEvent.click(
      within(rowOf('Stream a')).getByRole('button', { name: 'End' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.endLiveStream).not.toHaveBeenCalled();
  });

  it('says so and keeps the question open when ending fails', async () => {
    api.endLiveStream.mockRejectedValue(new Error('no'));
    api.getLiveStreams.mockResolvedValue(list([stream('a')]) as never);
    show();
    await screen.findByText('Stream a');

    fireEvent.click(
      within(rowOf('Stream a')).getByRole('button', { name: 'End' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to end live stream'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(api.getLiveStreams).toHaveBeenCalledTimes(1);
  });

  it('opens a broadcast on air with its player, figures and host', async () => {
    api.getLiveStreams.mockResolvedValue(
      list([stream('a', { viewerCount: 55 })]) as never,
    );
    show();
    await screen.findByText('Stream a');

    fireEvent.click(rowOf('Stream a'));

    const open = panel();
    expect(
      within(open).getByRole('heading', { name: 'Stream a' }),
    ).toBeInTheDocument();
    expect(within(open).getByText('Live')).toBeInTheDocument();
    expect(within(open).getByTestId('player')).toHaveAttribute(
      'data-src',
      'https://media.test/a.m3u8',
    );
    expect(within(open).getAllByText('55')).toHaveLength(2);
    expect(
      within(open).getByText('Gifts').parentElement?.parentElement,
    ).toHaveTextContent('4');
    expect(within(open).getByText('Participants')).toBeInTheDocument();
    expect(within(open).getByText('@host_a')).toBeInTheDocument();
    expect(within(open).getByText('Host')).toBeInTheDocument();
    expect(within(open).queryByText('Guest co-host')).not.toBeInTheDocument();
    expect(within(open).getByText('Moderation actions')).toBeInTheDocument();
    expect(rowOf('Stream a')).toHaveClass('border-brand-primary/30');
  });

  it('opens an ended broadcast with its replay and no moderation actions', async () => {
    api.getLiveStreams.mockResolvedValue(
      list([
        stream('b', {
          status: 'ENDED',
          hlsUrl: 'https://media.test/b.m3u8',
          replayUrl: 'https://media.test/b-replay.m3u8',
          coHost: { id: 'c1', profile: { username: 'guest', avatar: null } },
          _count: undefined,
        }),
      ]) as never,
    );
    show();
    await screen.findByText('Stream b');

    fireEvent.click(rowOf('Stream b'));

    const open = panel();
    expect(within(open).getByText('Ended')).toBeInTheDocument();
    expect(within(open).getByTestId('player')).toHaveAttribute(
      'data-src',
      'https://media.test/b-replay.m3u8',
    );
    expect(within(open).getByText('@guest')).toBeInTheDocument();
    expect(within(open).getByText('Guest co-host')).toBeInTheDocument();
    expect(
      within(open).getByText('Gifts').parentElement?.parentElement,
    ).toHaveTextContent('0');
    expect(
      within(open).queryByText('Moderation actions'),
    ).not.toBeInTheDocument();
  });

  it('says there is nothing to play when the broadcast has no video', async () => {
    api.getLiveStreams.mockResolvedValue(
      list([stream('a', { title: null, hlsUrl: null })]) as never,
    );
    show();
    await screen.findByText('Unknown');

    fireEvent.click(rowOf('Unknown'));

    const open = panel();
    expect(
      within(open).getByRole('heading', { name: 'Live by @host_a' }),
    ).toBeInTheDocument();
    expect(
      within(open).getByText('No video source available'),
    ).toBeInTheDocument();
    expect(within(open).queryByTestId('player')).not.toBeInTheDocument();
  });

  it('closes the open broadcast from its button and with Escape', async () => {
    api.getLiveStreams.mockResolvedValue(list([stream('a')]) as never);
    show();
    await screen.findByText('Stream a');

    fireEvent.click(rowOf('Stream a'));
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('min-h-11', 'min-w-11');
    fireEvent.click(close);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Close' }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(rowOf('Stream a'));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Close' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('closes the open broadcast once it is ended from there', async () => {
    api.getLiveStreams.mockResolvedValue(
      list([stream('a'), stream('b')]) as never,
    );
    show();
    await screen.findByText('Stream a');

    fireEvent.click(rowOf('Stream a'));
    fireEvent.click(
      within(panel()).getByRole('button', {
        name: /Force the broadcast to end/,
      }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End' }));

    await waitFor(() => expect(api.endLiveStream).toHaveBeenCalledWith('a'));
    // It was listed as on air: left open it would still say so.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Close' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps another broadcast open when a different one is ended', async () => {
    api.getLiveStreams.mockResolvedValue(
      list([stream('a'), stream('b')]) as never,
    );
    show();
    await screen.findByText('Stream a');

    fireEvent.click(rowOf('Stream a'));
    fireEvent.click(
      within(rowOf('Stream b')).getByRole('button', { name: 'End' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End' }));

    await waitFor(() => expect(api.endLiveStream).toHaveBeenCalledWith('b'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(
      within(panel()).getByRole('heading', { name: 'Stream a' }),
    ).toBeInTheDocument();
  });

  it('shows the open broadcast in Spanish to staff who use Spanish', async () => {
    api.getLiveStreams.mockResolvedValue(
      list([
        stream('a', {
          coHost: { id: 'c1', profile: { username: 'guest', avatar: null } },
        }),
      ]) as never,
    );
    show('/live', 'es');
    await screen.findByText('Stream a');

    fireEvent.click(rowOf('Stream a'));

    const open = screen.getByRole('button', { name: 'Cerrar' }).parentElement
      ?.parentElement as HTMLElement;
    for (const text of [
      'En vivo',
      'Participantes',
      'Anfitrión principal',
      'Coanfitrión invitado',
      'Acciones de moderación',
      'Enviar advertencia',
      'Forzar cierre de la transmisión',
    ]) {
      expect(within(open).getByText(text)).toBeInTheDocument();
    }
  });
});
