import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import type { Collection } from '../../types';
import CollectionCard from './CollectionCard';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const collection = (over: Partial<Collection> = {}): Collection =>
  ({
    id: 'c1',
    name: 'Travel',
    description: 'Places to go',
    coverUrl: 'cover.jpg',
    _count: { bookmarks: 12 },
    ...over,
  }) as Collection;

function show(
  over: Partial<Collection> = {},
  props: Partial<Parameters<typeof CollectionCard>[0]> = {},
) {
  const handlers = {
    onClick: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
  };
  const view = renderWithProviders(
    <CollectionCard
      collection={collection(over)}
      canManage
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, ...view };
}

const nameField = () =>
  screen.getByRole('textbox', { name: 'Collection Name' });
const descriptionField = () =>
  screen.getByRole('textbox', { name: 'Description (optional)' });
const rename = () => screen.getByRole('button', { name: 'Rename' });

describe('CollectionCard', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('shows the cover, the name, the description and how many posts it holds', () => {
    show();
    expect(screen.getByRole('img', { name: 'Travel' })).toHaveAttribute(
      'src',
      'cover.jpg',
    );
    expect(screen.getByRole('heading', { name: 'Travel' })).toBeInTheDocument();
    expect(screen.getByText('Places to go')).toBeInTheDocument();
    expect(screen.getByText('12 posts')).toBeInTheDocument();
  });

  it('shows the first letter for a collection with no cover, and no description or count it does not have', () => {
    show({ coverUrl: null, description: null, _count: undefined } as never);
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/posts$/)).not.toBeInTheDocument();
  });

  it('opens the collection when it is pressed', () => {
    const { onClick } = show();
    fireEvent.click(screen.getByRole('heading', { name: 'Travel' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to manage unless it may be managed', () => {
    show({}, { canManage: false });
    expect(
      screen.queryByRole('button', { name: 'Rename' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });

  describe('renaming', () => {
    it('opens the fields with what it has, without opening the collection', () => {
      const { onClick } = show();

      fireEvent.click(rename());

      expect(nameField()).toHaveValue('Travel');
      expect(descriptionField()).toHaveValue('Places to go');
      fireEvent.click(nameField());
      fireEvent.keyDown(nameField(), { key: 'a' });
      expect(onClick).not.toHaveBeenCalled();
    });

    it('saves the new name and description with Enter and says so', async () => {
      const { onRename } = show();
      fireEvent.click(rename());

      fireEvent.change(nameField(), { target: { value: '  Trips  ' } });
      fireEvent.change(descriptionField(), {
        target: { value: '  For the summer ' },
      });
      fireEvent.keyDown(nameField(), { key: 'Enter' });

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Collection renamed'),
      );
      expect(onRename).toHaveBeenCalledWith('c1', {
        name: 'Trips',
        description: 'For the summer',
      });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('saves from the pencil too, and sends no description when it is emptied', async () => {
      const { onRename } = show();
      fireEvent.click(rename());

      fireEvent.change(descriptionField(), { target: { value: '   ' } });
      fireEvent.click(rename());

      await waitFor(() =>
        expect(onRename).toHaveBeenCalledWith('c1', {
          name: 'Travel',
          description: null,
        }),
      );
    });

    it('asks the server nothing when nothing changed', () => {
      const { onRename } = show();
      fireEvent.click(rename());

      fireEvent.keyDown(nameField(), { key: 'Enter' });

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it.each([
      [
        'Escape in the name',
        () => fireEvent.keyDown(nameField(), { key: 'Escape' }),
      ],
      [
        'Escape in the description',
        () => fireEvent.keyDown(descriptionField(), { key: 'Escape' }),
      ],
      [
        'an empty name',
        () => {
          fireEvent.change(nameField(), { target: { value: '   ' } });
          fireEvent.keyDown(nameField(), { key: 'Enter' });
        },
      ],
    ])('drops the changes with %s', (_how, act) => {
      const { onRename } = show();
      fireEvent.click(rename());
      fireEvent.change(descriptionField(), {
        target: { value: 'Something else' },
      });

      act();

      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      fireEvent.click(rename());
      expect(nameField()).toHaveValue('Travel');
      expect(descriptionField()).toHaveValue('Places to go');
    });

    it('keeps the fields open and says so when the rename fails', async () => {
      show({}, { onRename: vi.fn().mockRejectedValue(new Error('down')) });
      fireEvent.click(rename());

      fireEvent.change(nameField(), { target: { value: 'Trips' } });
      fireEvent.keyDown(nameField(), { key: 'Enter' });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not rename'),
      );
      expect(nameField()).toHaveValue('Trips');
      await waitFor(() => expect(nameField()).toBeEnabled());
    });

    it('takes no second action while the rename is on its way', () => {
      show({}, { onRename: vi.fn(() => new Promise<void>(() => {})) });
      fireEvent.click(rename());
      fireEvent.change(nameField(), { target: { value: 'Trips' } });

      fireEvent.keyDown(nameField(), { key: 'Enter' });

      expect(nameField()).toBeDisabled();
      expect(rename()).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });
  });

  describe('deleting', () => {
    const remove = () => screen.getByRole('button', { name: 'Delete' });

    it('deletes after asking, without opening the collection, and says so', async () => {
      const ask = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { onDelete, onClick } = show();

      fireEvent.click(remove());

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Collection deleted'),
      );
      expect(ask).toHaveBeenCalledWith(
        'Delete this collection? Saved posts stay in Saved.',
      );
      expect(onDelete).toHaveBeenCalledWith('c1');
      expect(onClick).not.toHaveBeenCalled();
    });

    it('deletes nothing when the answer is no', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { onDelete } = show();
      fireEvent.click(remove());
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('says so when the collection could not be deleted', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      show({}, { onDelete: vi.fn().mockRejectedValue(new Error('down')) });

      fireEvent.click(remove());

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not delete'),
      );
      await waitFor(() => expect(remove()).toBeEnabled());
    });

    it('does nothing when it is given no way to delete', () => {
      const ask = vi.spyOn(window, 'confirm');
      show({}, { onDelete: undefined });
      fireEvent.click(remove());
      expect(ask).not.toHaveBeenCalled();
    });
  });

  it('closes the fields without saving when it is given no way to rename', () => {
    show({}, { onRename: undefined });
    fireEvent.click(rename());
    fireEvent.change(nameField(), { target: { value: 'Trips' } });
    fireEvent.keyDown(nameField(), { key: 'Enter' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
