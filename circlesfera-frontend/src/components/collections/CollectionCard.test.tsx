import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Collection } from '../../types';
import CollectionCard from './CollectionCard';

vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const collection = (over: object = {}) =>
  ({
    id: 'c-1',
    name: 'Trips',
    description: 'Places to go',
    coverUrl: null,
    _count: { bookmarks: 4 },
    ...over,
  }) as unknown as Collection;
const onClick = vi.fn();
const onRename = vi.fn();
const onDelete = vi.fn();
const show = (over: object = {}, props: object = { canManage: true }) =>
  renderWithProviders(
    <CollectionCard
      collection={collection(over)}
      onClick={onClick}
      onRename={onRename}
      onDelete={onDelete}
      {...props}
    />,
  );
const rename = () => screen.getByRole('button', { name: 'Rename' });
const remove = () => screen.getByRole('button', { name: 'Delete' });
const nameField = () => screen.getByLabelText('Collection Name');
const descriptionField = () => screen.getByLabelText('Description (optional)');

describe('CollectionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onRename.mockResolvedValue(undefined);
    onDelete.mockResolvedValue(undefined);
  });

  it('shows the name, the description and how many posts it holds', () => {
    show();

    expect(screen.getByText('Trips')).toBeInTheDocument();
    expect(screen.getByText('Places to go')).toBeInTheDocument();
    expect(screen.getByText('4 posts')).toBeInTheDocument();
    // Without a cover, the first letter stands for it.
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('shows the cover when there is one, and no count when it is unknown', () => {
    show({
      coverUrl: 'https://cdn.test/cover.jpg',
      description: null,
      _count: undefined,
    });

    expect(screen.getByRole('img', { name: 'Trips' })).toHaveAttribute(
      'src',
      'https://cdn.test/cover.jpg',
    );
    expect(screen.queryByText(/posts$/)).not.toBeInTheDocument();
  });

  it('opens the collection when pressed', () => {
    show();

    fireEvent.click(screen.getByText('Trips'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to manage to someone who cannot', () => {
    show({}, {});

    expect(
      screen.queryByRole('button', { name: 'Rename' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });

  it('renames with the new name and description, without opening the collection', async () => {
    show();

    fireEvent.click(rename());
    fireEvent.change(nameField(), { target: { value: '  Journeys ' } });
    fireEvent.change(descriptionField(), { target: { value: ' Far away ' } });
    fireEvent.click(nameField());
    fireEvent.click(rename());

    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith('c-1', {
        name: 'Journeys',
        description: 'Far away',
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Collection renamed'),
    );
    expect(screen.queryByLabelText('Collection Name')).not.toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('saves with Enter, and sends no description when it is emptied', async () => {
    show();

    fireEvent.click(rename());
    fireEvent.change(descriptionField(), { target: { value: '   ' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });

    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith('c-1', {
        name: 'Trips',
        description: null,
      }),
    );
  });

  it('asks for nothing when nothing changed', async () => {
    show();

    fireEvent.click(rename());
    fireEvent.click(rename());

    await waitFor(() =>
      expect(
        screen.queryByLabelText('Collection Name'),
      ).not.toBeInTheDocument(),
    );
    expect(onRename).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('goes back to the name it had when the new one is empty', async () => {
    show();

    fireEvent.click(rename());
    fireEvent.change(nameField(), { target: { value: '   ' } });
    fireEvent.click(rename());

    expect(await screen.findByText('Trips')).toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('leaves the fields with Escape, from either one, dropping what was typed', () => {
    show();

    fireEvent.click(rename());
    fireEvent.change(nameField(), { target: { value: 'Other' } });
    fireEvent.keyDown(nameField(), { key: 'Escape' });
    expect(screen.getByText('Trips')).toBeInTheDocument();

    fireEvent.click(rename());
    expect(nameField()).toHaveValue('Trips');
    fireEvent.keyDown(descriptionField(), { key: 'Escape' });
    expect(screen.queryByLabelText('Collection Name')).not.toBeInTheDocument();
  });

  it('says so when the rename fails, and keeps the fields open to try again', async () => {
    onRename.mockRejectedValue(new Error('down'));
    show();

    fireEvent.click(rename());
    fireEvent.change(nameField(), { target: { value: 'Journeys' } });
    fireEvent.click(rename());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not rename'),
    );
    expect(nameField()).toHaveValue('Journeys');
    expect(nameField()).toBeEnabled();
  });

  it('holds the fields and both controls while the rename is on its way', async () => {
    let done: () => void = () => {};
    onRename.mockReturnValue(
      new Promise<void>((resolve) => {
        done = resolve;
      }),
    );
    show();

    fireEvent.click(rename());
    fireEvent.change(nameField(), { target: { value: 'Journeys' } });
    fireEvent.click(rename());

    await waitFor(() => expect(nameField()).toBeDisabled());
    expect(descriptionField()).toBeDisabled();
    expect(rename()).toBeDisabled();
    expect(remove()).toBeDisabled();

    done();
    await waitFor(() => expect(rename()).toBeEnabled());
  });

  it('deletes after the person confirms, without opening the collection', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    show();

    fireEvent.click(remove());

    expect(confirm).toHaveBeenCalledWith(
      'Delete this collection? Saved posts stay in Saved.',
    );
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('c-1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Collection deleted'),
    );
    expect(onClick).not.toHaveBeenCalled();
  });

  it('deletes nothing when the person says no', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    show();

    fireEvent.click(remove());

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('says so when the delete fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    onDelete.mockRejectedValue(new Error('down'));
    show();

    fireEvent.click(remove());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not delete'),
    );
    expect(remove()).toBeEnabled();
  });

  it('does nothing to manage when it was given no way to', () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderWithProviders(
      <CollectionCard collection={collection()} onClick={onClick} canManage />,
    );

    fireEvent.click(remove());
    fireEvent.click(rename());
    fireEvent.change(nameField(), { target: { value: 'Journeys' } });
    fireEvent.click(rename());

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText('Trips')).toBeInTheDocument();
  });

  it('gives both controls the size of a finger', () => {
    show();

    expect(rename()).toHaveClass('min-h-11', 'min-w-11');
    expect(remove()).toHaveClass('min-h-11', 'min-w-11');
  });
});
