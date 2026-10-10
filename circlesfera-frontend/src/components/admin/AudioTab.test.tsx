import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import AudioTab from './AudioTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getAudio: vi.fn(),
    createAudio: vi.fn(),
    updateAudio: vi.fn(),
    deleteAudio: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();

const track = (id: string, over: object = {}) => ({
  id,
  title: `Song ${id}`,
  artist: `Artist ${id}`,
  url: `https://media.test/${id}.mp3`,
  thumbnailUrl: `https://media.test/${id}.jpg`,
  duration: 125,
  createdAt: '2026-03-10T11:00:00Z',
  ...over,
});
const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit: 10,
      totalPages,
    },
  },
});
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });
const field = (name: string) =>
  within(detail()).getByLabelText(name) as HTMLInputElement;
const fill = (values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) {
    fireEvent.change(field(name), { target: { value } });
  }
};
const show = () => renderWithProviders(<AudioTab onToast={onToast} />);

describe('AudioTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAudio.mockResolvedValue(list([]) as never);
    api.createAudio.mockResolvedValue({} as never);
    api.updateAudio.mockResolvedValue({} as never);
    api.deleteAudio.mockResolvedValue({} as never);
  });

  it('says the library is empty and offers to add the first track', async () => {
    show();

    expect(await screen.findByText('No tracks')).toBeInTheDocument();
    expect(api.getAudio).toHaveBeenCalledWith(1, 10, undefined);
    expect(screen.getAllByRole('button', { name: 'Add track' })).toHaveLength(
      2,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Add track' })[1]);
    expect(within(detail()).getByText('Add audio track')).toBeInTheDocument();
  });

  it('lists tracks with their length in minutes, searches from the first page and says when nothing matches', async () => {
    api.getAudio.mockImplementation((pageNumber = 1, _limit, search) =>
      Promise.resolve(
        (search
          ? list([])
          : list(
              [
                track(`p${pageNumber}`),
                track(`q${pageNumber}`, { duration: 59, thumbnailUrl: null }),
              ],
              pageNumber,
              3,
            )) as never,
      ),
    );
    show();

    await screen.findByText('Song p1');
    const first = rowOf('Song p1');
    expect(within(first).getByText('Artist p1')).toBeInTheDocument();
    expect(within(first).getByText('2:05')).toBeInTheDocument();
    expect(within(first).getByRole('img', { name: 'Song p1' })).toHaveAttribute(
      'src',
      'https://media.test/p1.jpg',
    );
    expect(within(rowOf('Song q1')).getByText('0:59')).toBeInTheDocument();
    expect(within(rowOf('Song q1')).queryByRole('img')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Song p2');

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search by title or artist...' }),
      { target: { value: 'zzz' } },
    );
    await waitFor(() =>
      expect(api.getAudio).toHaveBeenLastCalledWith(1, 10, 'zzz'),
    );
    expect(await screen.findByText('No results')).toBeInTheDocument();
    // The add button of an empty library is not offered for an empty search.
    expect(screen.getAllByRole('button', { name: 'Add track' })).toHaveLength(
      1,
    );
  });

  it('adds a track with its values trimmed and no cover when none is given', async () => {
    show();
    await screen.findByText('No tracks');
    fireEvent.click(screen.getAllByRole('button', { name: 'Add track' })[0]);

    fill({
      'Title *': '  New song ',
      'Artist *': ' Someone ',
      'Audio URL *': ' https://media.test/new.mp3 ',
      'Duration (sec) *': '180',
    });
    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Add track' }),
    );

    await waitFor(() =>
      expect(api.createAudio).toHaveBeenCalledWith({
        title: 'New song',
        artist: 'Someone',
        url: 'https://media.test/new.mp3',
        duration: 180,
        thumbnailUrl: undefined,
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Audio track added', 'success'),
    );
    expect(screen.queryByText('Add audio track')).not.toBeInTheDocument();
    expect(api.getAudio).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a title of spaces', { 'Title *': '   ' }],
    ['no artist', { 'Artist *': '' }],
    ['no address', { 'Audio URL *': '' }],
    ['no length', { 'Duration (sec) *': '' }],
    ['a length that is not a number', { 'Duration (sec) *': 'abc' }],
    ['a length of zero', { 'Duration (sec) *': '0' }],
  ])('sends nothing for a track with %s', async (_case, wrong) => {
    show();
    await screen.findByText('No tracks');
    fireEvent.click(screen.getAllByRole('button', { name: 'Add track' })[0]);
    fill({
      'Title *': 'Song',
      'Artist *': 'Artist',
      'Audio URL *': 'https://media.test/a.mp3',
      'Duration (sec) *': '60',
      ...wrong,
    });

    fireEvent.submit(field('Title *').closest('form') as HTMLFormElement);

    expect(api.createAudio).not.toHaveBeenCalled();
    expect(within(detail()).getByText('Add audio track')).toBeInTheDocument();
  });

  it('says so when a track cannot be added and keeps the form', async () => {
    api.createAudio.mockRejectedValue(new Error('no'));
    show();
    await screen.findByText('No tracks');
    fireEvent.click(screen.getAllByRole('button', { name: 'Add track' })[0]);
    fill({
      'Title *': 'Song',
      'Artist *': 'Artist',
      'Audio URL *': 'https://media.test/a.mp3',
      'Thumbnail URL': 'https://media.test/a.jpg',
      'Duration (sec) *': '60',
    });

    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Add track' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to create track', 'error'),
    );
    expect(api.createAudio).toHaveBeenCalledWith(
      expect.objectContaining({ thumbnailUrl: 'https://media.test/a.jpg' }),
    );
    expect(field('Title *')).toHaveValue('Song');
  });

  it('opens a track with its values and saves the changes', async () => {
    api.getAudio.mockResolvedValue(list([track('a')]) as never);
    show();
    await screen.findByText('Song a');

    fireEvent.click(
      within(rowOf('Song a')).getByRole('button', { name: 'Edit' }),
    );
    expect(within(detail()).getByText('Edit audio track')).toBeInTheDocument();
    expect(field('Title *')).toHaveValue('Song a');
    expect(field('Artist *')).toHaveValue('Artist a');
    expect(field('Audio URL *')).toHaveValue('https://media.test/a.mp3');
    expect(field('Thumbnail URL')).toHaveValue('https://media.test/a.jpg');
    expect(field('Duration (sec) *')).toHaveValue(125);

    fill({ 'Title *': 'Renamed', 'Thumbnail URL': '' });
    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() =>
      expect(api.updateAudio).toHaveBeenCalledWith('a', {
        title: 'Renamed',
        artist: 'Artist a',
        url: 'https://media.test/a.mp3',
        duration: 125,
        thumbnailUrl: undefined,
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Track updated', 'success'),
    );
    expect(screen.queryByText('Edit audio track')).not.toBeInTheDocument();
    expect(api.createAudio).not.toHaveBeenCalled();
  });

  it('says so when a track cannot be saved', async () => {
    api.updateAudio.mockRejectedValue(new Error('no'));
    api.getAudio.mockResolvedValue(
      list([track('a', { thumbnailUrl: null })]) as never,
    );
    show();
    await screen.findByText('Song a');
    fireEvent.click(rowOf('Song a'));
    expect(field('Thumbnail URL')).toHaveValue('');

    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Save changes' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to update track', 'error'),
    );
    expect(within(detail()).getByText('Edit audio track')).toBeInTheDocument();
  });

  it('leaves the form by Cancel or Escape, and a new track starts empty', async () => {
    api.getAudio.mockResolvedValue(list([track('a')]) as never);
    show();
    await screen.findByText('Song a');

    fireEvent.click(rowOf('Song a'));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Edit audio track')).not.toBeInTheDocument();

    fireEvent.click(rowOf('Song a'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('Edit audio track')).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add track' }));
    expect(field('Title *')).toHaveValue('');
    expect(field('Duration (sec) *')).toHaveValue(null);
  });

  it('deletes a track after a question that names it, and closes it if open', async () => {
    api.getAudio.mockResolvedValue(list([track('a')]) as never);
    show();
    await screen.findByText('Song a');
    fireEvent.click(rowOf('Song a'));

    const ask = async () => {
      fireEvent.click(
        within(rowOf('Song a')).getByRole('button', { name: 'More actions' }),
      );
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
      return screen.findByRole('dialog');
    };

    let dialog = await ask();
    expect(
      within(dialog).getByText(
        'Are you sure you want to delete "Song a" by Artist a?',
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.deleteAudio).not.toHaveBeenCalled();

    dialog = await ask();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteAudio).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Track deleted', 'success'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit audio track')).not.toBeInTheDocument();
  });

  it('says so when a track cannot be deleted', async () => {
    api.deleteAudio.mockRejectedValue(new Error('no'));
    api.getAudio.mockResolvedValue(list([track('a')]) as never);
    show();
    await screen.findByText('Song a');

    fireEvent.click(
      within(rowOf('Song a')).getByRole('button', { name: 'More actions' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to delete track', 'error'),
    );
    expect(screen.getByText('Song a')).toBeInTheDocument();
  });
});
