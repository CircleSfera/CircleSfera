import { GIF_PAGE_SIZE } from '@circlesfera/shared';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { GifPicker } from './GifPicker';

const api = vi.hoisted(() => ({ trending: vi.fn(), search: vi.fn() }));
vi.mock('../../services/gifs.service', () => ({ gifsApi: api }));

const gif = (id: string) => ({
  id,
  title: `title ${id}`,
  url: `https://media.giphy.com/media/${id}/200.webp`,
  width: 200,
  height: 150,
});
const page = (from: number, count: number) => ({
  data: {
    data: Array.from({ length: count }, (_, i) => gif(`g${from + i}`)),
  },
});

describe('GifPicker', () => {
  const onPick = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    api.trending.mockResolvedValue(page(0, 2));
    api.search.mockResolvedValue(page(100, 1));
  });

  const show = () =>
    renderWithProviders(<GifPicker isOpen onClose={onClose} onPick={onPick} />);

  it('shows trending GIFs first, with GIPHY named', async () => {
    const { i18n } = show();

    expect(
      await screen.findByRole('button', { name: 'title g0' }),
    ).toBeInTheDocument();
    expect(api.trending).toHaveBeenCalledWith(0);
    expect(screen.getByText(i18n!.t('chat.gif_powered'))).toBeInTheDocument();
  });

  it('picks the GIF tapped', async () => {
    show();

    fireEvent.click(await screen.findByRole('button', { name: 'title g1' }));

    expect(onPick).toHaveBeenCalledWith(gif('g1'));
  });

  it('searches the words typed, after a short pause', async () => {
    const { i18n } = show();
    await screen.findByRole('button', { name: 'title g0' });

    fireEvent.change(screen.getByPlaceholderText(i18n!.t('chat.gif_search')), {
      target: { value: '  cats ' },
    });

    expect(
      await screen.findByRole('button', { name: 'title g100' }),
    ).toBeInTheDocument();
    expect(api.search).toHaveBeenCalledWith('cats', 0);
  });

  it('asks for more only when a whole page came', async () => {
    api.trending
      .mockResolvedValueOnce(page(0, GIF_PAGE_SIZE))
      .mockResolvedValueOnce(page(GIF_PAGE_SIZE, 1));
    const { i18n } = show();

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('chat.gif_load_more'),
      }),
    );

    await waitFor(() =>
      expect(api.trending).toHaveBeenCalledWith(GIF_PAGE_SIZE),
    );
    await screen.findByRole('button', { name: `title g${GIF_PAGE_SIZE}` });
    expect(
      screen.queryByRole('button', { name: i18n!.t('chat.gif_load_more') }),
    ).not.toBeInTheDocument();
  });

  it('says when nothing is found, and when GIFs cannot be loaded', async () => {
    api.trending.mockResolvedValueOnce({ data: { data: [] } });
    const { i18n, unmount } = show();
    expect(
      await screen.findByText(i18n!.t('chat.gif_empty')),
    ).toBeInTheDocument();
    unmount();

    api.trending.mockRejectedValue(new Error('down'));
    show();
    expect(
      await screen.findByText(i18n!.t('chat.gif_error'), {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('names an untitled GIF as a GIF, and asks nothing while closed', async () => {
    api.trending.mockResolvedValue({
      data: { data: [{ ...gif('g9'), title: '' }] },
    });
    const { i18n, unmount } = show();
    expect(
      await screen.findByRole('button', { name: i18n!.t('chat.gif_alt') }),
    ).toBeInTheDocument();
    unmount();

    vi.clearAllMocks();
    await act(async () => {
      renderWithProviders(
        <GifPicker isOpen={false} onClose={onClose} onPick={onPick} />,
      );
    });
    expect(api.trending).not.toHaveBeenCalled();
  });
});
