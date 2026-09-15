import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarksApi, collectionsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import type { Collection } from '../../types';
import AddToCollectionModal from './AddToCollectionModal';

vi.mock('../../services', () => ({
  collectionsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
  bookmarksApi: {
    updateCollection: vi.fn(),
  },
}));

const travel: Collection = {
  id: 'col-travel',
  profileId: 'me-1',
  name: 'Travel',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  _count: { bookmarks: 3 },
};

describe('AddToCollectionModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(collectionsApi.getAll).mockResolvedValue({
      data: [travel],
    } as never);
    vi.mocked(collectionsApi.create).mockResolvedValue({
      data: { id: 'col-new' },
    } as never);
    vi.mocked(bookmarksApi.updateCollection).mockResolvedValue({} as never);
  });

  it('renders nothing when closed and does not fetch', () => {
    renderWithProviders(
      <AddToCollectionModal isOpen={false} onClose={onClose} postId="post-1" />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(collectionsApi.getAll).not.toHaveBeenCalled();
  });

  it('closes from the dialog X without moving the bookmark', async () => {
    renderWithProviders(
      <AddToCollectionModal isOpen onClose={onClose} postId="post-1" />,
    );

    expect(await screen.findByText('Travel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bookmarksApi.updateCollection).not.toHaveBeenCalled();
    expect(collectionsApi.create).not.toHaveBeenCalled();
  });

  it('adds the post to an existing collection and closes', async () => {
    const { i18n } = renderWithProviders(
      <AddToCollectionModal isOpen onClose={onClose} postId="post-1" />,
    );

    expect(
      await screen.findByText(i18n!.t('collections.posts_count', { count: 3 })),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /travel/i }));

    await waitFor(() => {
      expect(bookmarksApi.updateCollection).toHaveBeenCalledWith(
        'post-1',
        'col-travel',
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('creates a collection then saves the post into it', async () => {
    const { i18n } = renderWithProviders(
      <AddToCollectionModal isOpen onClose={onClose} postId="post-1" />,
    );

    await screen.findByText('Travel');
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('collections.new_collection'),
      }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(i18n!.t('collections.collection_name')),
      {
        target: { value: 'Weekend' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('collections.create'),
      }),
    );

    await waitFor(() => {
      expect(collectionsApi.create).toHaveBeenCalledWith({ name: 'Weekend' });
    });
    await waitFor(() => {
      expect(bookmarksApi.updateCollection).toHaveBeenCalledWith(
        'post-1',
        'col-new',
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cancels inline create without calling the API', async () => {
    const { i18n } = renderWithProviders(
      <AddToCollectionModal isOpen onClose={onClose} postId="post-1" />,
    );

    await screen.findByText('Travel');
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('collections.new_collection'),
      }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(i18n!.t('collections.collection_name')),
      {
        target: { value: 'Nope' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('common.cancel'),
      }),
    );

    expect(
      screen.queryByPlaceholderText(i18n!.t('collections.collection_name')),
    ).not.toBeInTheDocument();
    expect(collectionsApi.create).not.toHaveBeenCalled();
    expect(bookmarksApi.updateCollection).not.toHaveBeenCalled();
  });

  it('uses the frame sheet title and closes without saving', async () => {
    const { i18n } = renderWithProviders(
      <AddToCollectionModal
        isOpen
        onClose={onClose}
        postId="post-1"
        presentation="frame"
      />,
    );

    expect(
      await screen.findByText(i18n!.t('frames.save_to_collection')),
    ).toBeInTheDocument();
    expect(await screen.findByText('Travel')).toBeInTheDocument();

    const closeButtons = screen.getAllByRole('button', {
      name: i18n!.t('frames.close'),
    });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bookmarksApi.updateCollection).not.toHaveBeenCalled();
  });
});
