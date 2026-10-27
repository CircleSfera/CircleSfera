import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { archiveApi, postsApi, storiesApi, usersApi } from '../../services';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import ArchiveSettings from './ArchiveSettings';

vi.mock('../../services', () => ({
  archiveApi: { listPosts: vi.fn(), archive: vi.fn(), unarchive: vi.fn() },
  postsApi: { delete: vi.fn() },
  storiesApi: { getArchive: vi.fn(), delete: vi.fn() },
  usersApi: { getSettings: vi.fn(), updateSettings: vi.fn() },
}));
vi.mock('../modals/CreateHighlightModal', () => ({
  default: ({ initialStoryIds }: { initialStoryIds: string[] }) => (
    <div>highlight-picker:{initialStoryIds.join(',')}</div>
  ),
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const archive = vi.mocked(archiveApi);
const posts = vi.mocked(postsApi);
const stories = vi.mocked(storiesApi);
const users = vi.mocked(usersApi);

const archived = (over: object = {}) => ({
  kind: 'POST' as const,
  id: 'p1',
  createdAt: '2026-10-01T10:00:00Z',
  archivedAt: '2026-10-20T10:00:00Z',
  caption: 'Sunset',
  mediaType: 'image' as const,
  url: '/uploads/p1.jpg',
  standardUrl: null,
  thumbnailUrl: null,
  mediaCount: 1,
  likesCount: 4,
  commentsCount: 2,
  ...over,
});
const story = (over: object = {}) => ({
  id: 's1',
  url: '/uploads/s1.jpg',
  mediaType: 'image',
  createdAt: '2026-10-02T10:00:00Z',
  expiresAt: '2026-10-03T10:00:00Z',
  ...over,
});
const show = () => renderWithProviders(<ArchiveSettings />);
const openTab = (name: string) =>
  fireEvent.click(screen.getByRole('tab', { name }));

describe('ArchiveSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ profile: { id: 'me' } as never });
    stories.getArchive.mockResolvedValue({ data: [] } as never);
    archive.listPosts.mockResolvedValue({
      data: { items: [], nextCursor: null },
    } as never);
    users.getSettings.mockResolvedValue({
      data: { saveStoriesToArchive: true },
    } as never);
    users.updateSettings.mockResolvedValue({ data: {} } as never);
  });

  it('opens on the stories, with the setting that keeps them, on by default', async () => {
    show();

    expect(screen.getByRole('tab', { name: 'Stories' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('No stories yet')).toBeInTheDocument();
    const toggle = screen.getByRole('checkbox', {
      name: 'Save stories to archive',
    });
    await waitFor(() => expect(toggle).toBeChecked());
    expect(
      screen.getByText(/Off, the stories that end are not kept/),
    ).toBeInTheDocument();
  });

  it('shows the setting off when the Profile turned it off, and saves a change', async () => {
    users.getSettings.mockResolvedValue({
      data: { saveStoriesToArchive: false },
    } as never);
    show();

    const toggle = screen.getByRole('checkbox', {
      name: 'Save stories to archive',
    });
    await waitFor(() => expect(toggle).not.toBeChecked());
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(users.updateSettings).toHaveBeenCalledWith({
        saveStoriesToArchive: true,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Setting saved'),
    );
  });

  it('puts the setting back when it could not be saved', async () => {
    users.updateSettings.mockRejectedValue(new Error('down'));
    show();

    const toggle = screen.getByRole('checkbox', {
      name: 'Save stories to archive',
    });
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The setting could not be saved. Try again.',
      ),
    );
    expect(toggle).toBeChecked();
  });

  it('keeps the setting on when it could not be read', async () => {
    users.getSettings.mockRejectedValue(new Error('down'));
    show();

    const toggle = screen.getByRole('checkbox', {
      name: 'Save stories to archive',
    });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).toBeChecked();
  });

  it('adds an archived story to a highlight', async () => {
    stories.getArchive.mockResolvedValue({ data: [story()] } as never);
    show();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open story from the archive',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to highlight' }));

    expect(screen.getByText('highlight-picker:s1')).toBeInTheDocument();
  });

  it('deletes an archived story into Recently deleted, after asking', async () => {
    stories.getArchive.mockResolvedValue({
      data: [story({ mediaType: 'video', url: '/uploads/s1.mp4' })],
    } as never);
    stories.delete.mockResolvedValue({} as never);
    show();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open story from the archive',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(stories.delete).toHaveBeenCalledWith('s1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Moved to Recently deleted'),
    );
  });

  it('says when a story could not be deleted', async () => {
    stories.getArchive.mockResolvedValue({ data: [story()] } as never);
    stories.delete.mockRejectedValue(new Error('down'));
    show();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open story from the archive',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'It could not be deleted. Try again.',
      ),
    );
  });

  it('offers a retry when the stories could not be loaded', async () => {
    stories.getArchive.mockRejectedValue(new Error('down'));
    show();

    expect(
      await screen.findByText('Your archive could not be loaded'),
    ).toBeInTheDocument();
  });

  it('lists archived posts with their likes and comments, and frames apart', async () => {
    archive.listPosts.mockImplementation(
      async (type) =>
        ({
          data: {
            items:
              type === 'POST'
                ? [archived({ mediaCount: 3 })]
                : [
                    archived({
                      kind: 'FRAME',
                      id: 'f1',
                      mediaType: 'video',
                      url: '/uploads/f1.mp4',
                    }),
                  ],
            nextCursor: null,
          },
        }) as never,
    );
    show();

    openTab('Posts');
    const tile = await screen.findByRole('button', {
      name: 'Open post from the archive',
    });
    expect(within(tile).getByText('4')).toBeInTheDocument();
    expect(within(tile).getByText('2')).toBeInTheDocument();
    expect(archive.listPosts).toHaveBeenCalledWith('POST', undefined);

    openTab('Frames');
    expect(
      await screen.findByRole('button', {
        name: 'Open frame from the archive',
      }),
    ).toBeInTheDocument();
    expect(archive.listPosts).toHaveBeenCalledWith('FRAME', undefined);
    expect(
      document.querySelector('video[src="/uploads/f1.mp4#t=0.001"]'),
    ).not.toBeNull();
  });

  it('says when there is nothing archived, and when the list could not be loaded', async () => {
    show();
    openTab('Frames');
    expect(await screen.findByText('No archived frames')).toBeInTheDocument();

    archive.listPosts.mockRejectedValue(new Error('down'));
    openTab('Posts');
    expect(
      await screen.findByText('Your archive could not be loaded'),
    ).toBeInTheDocument();
  });

  it('shows a post with no picture as a plain tile with its text', async () => {
    archive.listPosts.mockResolvedValue({
      data: {
        items: [archived({ url: '', caption: 'Just words', mediaCount: 0 })],
        nextCursor: null,
      },
    } as never);
    show();
    openTab('Posts');

    expect(await screen.findByText('Just words')).toBeInTheDocument();
    expect(document.querySelector('img[src=""]')).toBeNull();
  });

  it('shows an archived post on the profile again and takes it off the list', async () => {
    archive.listPosts.mockResolvedValue({
      data: { items: [archived()], nextCursor: null },
    } as never);
    archive.unarchive.mockResolvedValue({ data: { id: 'p1' } } as never);
    show();
    openTab('Posts');

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open post from the archive',
      }),
    );
    expect(screen.getByText('4 likes · 2 comments')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/p/p1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show on profile' }));

    await waitFor(() => expect(archive.unarchive).toHaveBeenCalledWith('p1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Back on your profile'),
    );
    expect(await screen.findByText('No archived posts')).toBeInTheDocument();
  });

  it('says when a post could not be shown again', async () => {
    archive.listPosts.mockResolvedValue({
      data: {
        items: [archived({ likesCount: 1, commentsCount: 1 })],
        nextCursor: null,
      },
    } as never);
    archive.unarchive.mockRejectedValue(new Error('down'));
    show();
    openTab('Posts');

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open post from the archive',
      }),
    );
    expect(screen.getByText('1 like · 1 comment')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show on profile' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'It could not be shown on your profile. Try again.',
      ),
    );
  });

  it('deletes an archived post into Recently deleted, after asking', async () => {
    archive.listPosts.mockResolvedValue({
      data: { items: [archived()], nextCursor: null },
    } as never);
    posts.delete.mockResolvedValue({} as never);
    show();
    openTab('Posts');

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open post from the archive',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(posts.delete).toHaveBeenCalledWith('p1'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Moved to Recently deleted'),
    );
  });

  it('says when a post could not be deleted', async () => {
    archive.listPosts.mockResolvedValue({
      data: { items: [archived()], nextCursor: null },
    } as never);
    posts.delete.mockRejectedValue(new Error('down'));
    show();
    openTab('Posts');

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open post from the archive',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'It could not be deleted. Try again.',
      ),
    );
  });

  it('asks nothing until it knows whose archive it is', async () => {
    useAuthStore.setState({ profile: null });
    show();
    openTab('Posts');

    await waitFor(() => expect(archive.listPosts).not.toHaveBeenCalled());
    expect(stories.getArchive).not.toHaveBeenCalled();
  });
});
