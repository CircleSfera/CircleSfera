import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/test-utils';
import DeviceGallery from './DeviceGallery';

const library = vi.hoisted(() => ({
  requestAccess: vi.fn(),
  manageLimitedAccess: vi.fn(),
  recent: vi.fn(),
  preview: vi.fn(),
  clearExports: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../../../utils/photoLibrary', () => ({
  PhotoLibrary: library,
  readGalleryFile: library.read,
}));
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() } }));

const item = (n: number, isVideo = false) => ({
  id: `id-${n}`,
  thumbnail: `data:image/jpeg;base64,${n}`,
  isVideo,
  duration: isVideo ? 75 : undefined,
});

/** The person's own file input, which the files chosen go through. */
function fileInput() {
  const input = document.createElement('input');
  input.type = 'file';
  // The test page cannot hold a real list of files; the input keeps what it is given.
  Object.defineProperty(input, 'files', { writable: true, value: null });
  const changed = vi.fn();
  input.addEventListener('change', changed);
  return { ref: { current: input }, input, changed };
}

function show(props: Partial<React.ComponentProps<typeof DeviceGallery>> = {}) {
  const { ref, input, changed } = fileInput();
  const onContinueChange = vi.fn();
  const fallback = vi.fn((reason: string) => <p>fallback {reason}</p>);
  renderWithProviders(
    <DeviceGallery
      videosOnly={false}
      single={false}
      ratio="4 / 5"
      fileInputRef={ref}
      onContinueChange={onContinueChange}
      onPickOther={vi.fn()}
      onOpenCamera={vi.fn()}
      fallback={fallback}
      {...props}
    />,
    { lng: 'es' },
  );
  /** What "Next" would do now, or null. */
  const proceed = () =>
    onContinueChange.mock.calls[onContinueChange.mock.calls.length - 1][0];
  return { input, changed, onContinueChange, fallback, proceed };
}

const tile = (name: string) => screen.getByRole('button', { name });

/** The gallery has listed its items and chosen the newest. */
const ready = (name = 'Foto 1') =>
  waitFor(() => expect(tile(name)).toHaveAttribute('aria-pressed', 'true'));

describe('DeviceGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    library.requestAccess.mockResolvedValue({ access: 'full' });
    library.recent.mockResolvedValue({
      items: [item(1), item(2), item(3, true)],
      total: 3,
    });
    library.preview.mockResolvedValue({
      picture: 'data:image/jpeg;base64,big',
    });
    library.clearExports.mockResolvedValue(undefined);
    library.manageLimitedAccess.mockResolvedValue(undefined);
    library.read.mockImplementation(
      async (id: string) =>
        new File(['x'], `${id}.jpg`, { type: 'image/jpeg' }),
    );
    vi.stubGlobal(
      'DataTransfer',
      class {
        files: File[] = [];
        items = { add: (file: File) => this.files.push(file) };
      },
    );
  });

  it('lists the recent photos and videos, the newest chosen', async () => {
    const { proceed } = show();

    await ready();
    expect(tile('Foto 2')).toHaveAttribute('aria-pressed', 'false');
    expect(tile('Vídeo 3, 1:15')).toBeInTheDocument();
    expect(library.recent).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 60, kind: 'all' }),
    );
    await waitFor(() => expect(proceed()).toEqual(expect.any(Function)));
  });

  it('numbers the items in the order chosen, and leaves out the one on show when tapped again', async () => {
    show();
    await ready();

    fireEvent.click(tile('Foto 2'));
    expect(tile('Foto 2')).toHaveTextContent('2');
    expect(library.preview).toHaveBeenLastCalledWith({
      id: 'id-2',
      size: 1080,
    });

    fireEvent.click(tile('Foto 2'));
    expect(tile('Foto 2')).toHaveAttribute('aria-pressed', 'false');
    expect(tile('Foto 1')).toHaveAttribute('aria-pressed', 'true');
  });

  it('brings a chosen item back on show without leaving it out', async () => {
    show();
    await ready();
    fireEvent.click(tile('Foto 2'));

    fireEvent.click(tile('Foto 1'));

    expect(tile('Foto 1')).toHaveAttribute('aria-pressed', 'true');
    expect(tile('Foto 2')).toHaveAttribute('aria-pressed', 'true');
    expect(library.preview).toHaveBeenLastCalledWith({
      id: 'id-1',
      size: 1080,
    });
  });

  it('chooses no more than the limit, and says why', async () => {
    show({ maxSelected: 2 });
    await ready();
    fireEvent.click(tile('Foto 2'));

    fireEvent.click(tile('Vídeo 3, 1:15'));

    expect(tile('Vídeo 3, 1:15')).toHaveAttribute('aria-pressed', 'false');
    expect(toast.error).toHaveBeenCalledWith(
      'Una publicación admite hasta 2 fotos y vídeos.',
    );
  });

  it('nothing chosen, nothing to go on with', async () => {
    const { proceed } = show();
    await ready();

    fireEvent.click(tile('Foto 1'));

    await waitFor(() => expect(proceed()).toBeNull());
  });

  it('takes one item at a time for a frame, without numbers', async () => {
    library.recent.mockResolvedValue({
      items: [item(1, true), item(2, true)],
      total: 2,
    });
    show({ videosOnly: true, single: true });
    await ready('Vídeo 1, 1:15');
    expect(library.recent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'videos' }),
    );

    fireEvent.click(tile('Vídeo 2, 1:15'));

    expect(tile('Vídeo 1, 1:15')).toHaveAttribute('aria-pressed', 'false');
    expect(tile('Vídeo 2, 1:15')).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(tile('Vídeo 2, 1:15')).queryByText('1', { exact: true }),
    ).not.toBeInTheDocument();
  });

  it('hands the chosen items, in order, to the file input as files', async () => {
    const { input, changed, proceed } = show();
    await ready();
    fireEvent.click(tile('Vídeo 3, 1:15'));
    await waitFor(() => expect(proceed()).toEqual(expect.any(Function)));

    await act(async () => proceed()());

    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(library.read.mock.calls.map(([id]) => id)).toEqual(['id-1', 'id-3']);
    expect(Array.from(input.files ?? []).map((f) => f.name)).toEqual([
      'id-1.jpg',
      'id-3.jpg',
    ]);
    expect(library.clearExports).toHaveBeenCalled();
  });

  it('says so when the chosen items cannot be opened', async () => {
    library.read.mockRejectedValue(new Error('gone'));
    const { changed, proceed } = show();
    await ready();
    await waitFor(() => expect(proceed()).toEqual(expect.any(Function)));

    await act(async () => proceed()());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'No se pudieron abrir los elementos elegidos. Inténtalo de nuevo.',
      ),
    );
    expect(changed).not.toHaveBeenCalled();
  });

  it('gives way to picking files when access is refused', async () => {
    library.requestAccess.mockResolvedValue({ access: 'denied' });
    const { fallback } = show();

    expect(await screen.findByText('fallback denied')).toBeInTheDocument();
    expect(fallback).toHaveBeenCalledWith('denied');
    expect(library.recent).not.toHaveBeenCalled();
  });

  it('gives way to picking files when the photos cannot be listed', async () => {
    library.recent.mockRejectedValue(new Error('broken'));
    show();

    expect(await screen.findByText('fallback failed')).toBeInTheDocument();
  });

  it('lets a person with limited access choose more, and lists them again', async () => {
    library.requestAccess.mockResolvedValue({ access: 'limited' });
    show();

    expect(
      await screen.findByText('Has dado acceso a algunas de tus fotos.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }));

    await waitFor(() => expect(library.manageLimitedAccess).toHaveBeenCalled());
    await waitFor(() => expect(library.recent).toHaveBeenCalledTimes(2));
  });

  it('loads the next sixty as the end of the grid comes into view', async () => {
    let seeEnd: (() => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(
          callback: (entries: { isIntersecting: boolean }[]) => void,
        ) {
          seeEnd = () => callback([{ isIntersecting: true }]);
        }
        observe() {}
        disconnect() {}
      },
    );
    library.recent
      .mockResolvedValueOnce({ items: [item(1)], total: 2 })
      .mockResolvedValueOnce({ items: [item(2)], total: 2 });
    show();
    await ready();

    act(() => seeEnd?.());

    expect(
      await screen.findByRole('button', { name: 'Foto 2' }),
    ).toBeInTheDocument();
    expect(library.recent).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 1 }),
    );
  });

  it('says when there is nothing yet', async () => {
    library.recent.mockResolvedValue({ items: [], total: 0 });
    show();

    expect(
      await screen.findByText('Aún no hay fotos ni vídeos.'),
    ).toBeInTheDocument();
  });
});
