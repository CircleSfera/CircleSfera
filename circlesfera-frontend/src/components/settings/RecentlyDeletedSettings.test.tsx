import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recentlyDeletedApi } from '../../services/recentlyDeleted.service';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import RecentlyDeletedSettings from './RecentlyDeletedSettings';

vi.mock('../../services/recentlyDeleted.service', () => ({
  recentlyDeletedApi: {
    list: vi.fn(),
    restorePost: vi.fn(),
    restoreStory: vi.fn(),
    deletePostForGood: vi.fn(),
    deleteStoryForGood: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(recentlyDeletedApi);
const item = (over: object = {}) => ({
  kind: 'POST' as const,
  id: 'p1',
  deletedAt: '2026-10-20T10:00:00Z',
  createdAt: '2026-10-01T10:00:00Z',
  daysLeft: 23,
  caption: 'Sunset',
  mediaType: 'image' as const,
  url: '/uploads/p1.jpg',
  standardUrl: null,
  thumbnailUrl: null,
  mediaCount: 1,
  ...over,
});
const show = () => renderWithProviders(<RecentlyDeletedSettings />);

describe('RecentlyDeletedSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue({ data: { items: [] } } as never);
    useAuthStore.setState({ profile: { id: 'me' } as never });
  });

  it('asks nothing until it knows whose list it is', async () => {
    useAuthStore.setState({ profile: null });
    show();

    await waitFor(() => expect(api.list).not.toHaveBeenCalled());
  });

  it('shows a deleted post with no picture as a plain tile with its text', async () => {
    api.list.mockResolvedValue({
      data: {
        items: [
          {
            kind: 'POST',
            id: 'text-only',
            deletedAt: '2026-10-20T00:00:00.000Z',
            createdAt: '2026-10-01T00:00:00.000Z',
            daysLeft: 20,
            caption: 'Just words',
            mediaType: 'image',
            url: '',
            standardUrl: null,
            thumbnailUrl: null,
            mediaCount: 0,
          },
        ],
      },
    } as never);
    show();

    expect(await screen.findByText('Just words')).toBeInTheDocument();
    expect(document.querySelector('img[src=""]')).toBeNull();
  });

  it('says when nothing was deleted', async () => {
    show();

    expect(
      await screen.findByText('Nothing deleted recently'),
    ).toBeInTheDocument();
  });

  it('shows each deleted item with the days it has left', async () => {
    api.list.mockResolvedValue({
      data: {
        items: [
          item(),
          item({ kind: 'STORY', id: 's1', daysLeft: 1, mediaType: 'video' }),
          item({ kind: 'FRAME', id: 'f1', daysLeft: 0 }),
        ],
      },
    } as never);
    show();

    expect(await screen.findByText('23 days')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open deleted Post, 23 days left' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Open deleted Frame, Less than a day left',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 day')).toBeInTheDocument();
    expect(screen.getByText('< 1 day')).toBeInTheDocument();
    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('Frame')).toBeInTheDocument();
  });

  it('offers to try again when the list cannot be loaded', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'));
    show();

    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));

    expect(
      await screen.findByText('Nothing deleted recently'),
    ).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('restores a post and takes it off the list', async () => {
    api.list.mockResolvedValue({ data: { items: [item()] } } as never);
    api.restorePost.mockResolvedValue({
      data: { id: 'p1', kind: 'POST' },
    } as never);
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: /Open deleted Post/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(api.restorePost).toHaveBeenCalledWith('p1'));
    await waitFor(() =>
      expect(screen.queryByText('23 days')).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith('Restored');
  });

  it('says a story whose day is over went back to the archive', async () => {
    api.list.mockResolvedValue({
      data: { items: [item({ kind: 'STORY', id: 's1' })] },
    } as never);
    api.restoreStory.mockResolvedValue({
      data: { id: 's1', archived: true },
    } as never);
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: /Open deleted Story/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(api.restoreStory).toHaveBeenCalledWith('s1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Restored to your story archive',
      ),
    );
  });

  it('asks before deleting for good, then deletes', async () => {
    api.list.mockResolvedValue({
      data: { items: [item({ kind: 'FRAME', id: 'f1' })] },
    } as never);
    api.deletePostForGood.mockResolvedValue({} as never);
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: /Open deleted Frame/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Delete for good?')).toBeInTheDocument();
    expect(api.deletePostForGood).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));

    await waitFor(() =>
      expect(api.deletePostForGood).toHaveBeenCalledWith('f1'),
    );
    await waitFor(() =>
      expect(screen.queryByText('23 days')).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith('Deleted for good');
  });

  it('keeps the item and says so when restoring fails', async () => {
    api.list.mockResolvedValue({ data: { items: [item()] } } as never);
    api.restorePost.mockRejectedValue(new Error('gone'));
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: /Open deleted Post/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'It could not be restored. Try again.',
      ),
    );
  });
});
