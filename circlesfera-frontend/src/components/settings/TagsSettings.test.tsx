import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postTagsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import TagsSettings from './TagsSettings';

vi.mock('../../services', () => ({
  postTagsApi: { list: vi.fn(), approve: vi.fn(), remove: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast: fn, default: fn };
});

const api = vi.mocked(postTagsApi);
const tag = (id: string, status: 'SHOWN' | 'PENDING', over: object = {}) => ({
  createdAt: '2026-11-01T10:00:00Z',
  status,
  post: {
    id,
    caption: `caption ${id}`,
    createdAt: '2026-11-01T10:00:00Z',
    thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
    profile: { id: `author-${id}`, username: `author_${id}` },
    ...over,
  },
});
let lists: Record<string, ReturnType<typeof tag>[]>;
const rowOf = (name: string) =>
  screen.getByText(name).closest('li') as HTMLElement;

describe('TagsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lists = {
      PENDING: [tag('p1', 'PENDING')],
      SHOWN: [tag('s1', 'SHOWN', { thumbnailUrl: null })],
    };
    api.list.mockImplementation(
      async (status) => ({ data: { data: lists[status] } }) as never,
    );
    api.approve.mockImplementation(async (postId) => {
      const moved = lists.PENDING.find((t) => t.post.id === postId);
      lists.PENDING = lists.PENDING.filter((t) => t.post.id !== postId);
      if (moved) lists.SHOWN = [{ ...moved, status: 'SHOWN' }, ...lists.SHOWN];
      return {} as never;
    });
    api.remove.mockImplementation(async (postId) => {
      lists.PENDING = lists.PENDING.filter((t) => t.post.id !== postId);
      lists.SHOWN = lists.SHOWN.filter((t) => t.post.id !== postId);
      return {} as never;
    });
  });

  it('lists the waiting tags and the shown ones, each linked to its post', async () => {
    renderWithProviders(<TagsSettings />);

    const waiting = await screen.findByText('Post by author_p1');
    expect(waiting.closest('a')).toHaveAttribute('href', '/p/p1');
    const pendingRow = rowOf('Post by author_p1');
    expect(
      within(pendingRow).getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument();

    const shownRow = rowOf('Post by author_s1');
    // A shown tag can only be removed.
    expect(
      within(shownRow).queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    // No picture is shown where the post has none to show.
    expect(shownRow.querySelector('img')).toBeNull();
    expect(pendingRow.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/p1.jpg',
    );
  });

  it('approves a waiting tag, which then shows on the profile', async () => {
    renderWithProviders(<TagsSettings />);
    await screen.findByText('Post by author_p1');

    fireEvent.click(
      within(rowOf('Post by author_p1')).getByRole('button', {
        name: 'Approve',
      }),
    );

    await waitFor(() => expect(api.approve).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('No tags waiting')).toBeInTheDocument();
    expect(
      within(rowOf('Post by author_p1')).queryByRole('button', {
        name: 'Approve',
      }),
    ).not.toBeInTheDocument();
  });

  it('takes the Profile off a post', async () => {
    renderWithProviders(<TagsSettings />);
    await screen.findByText('Post by author_s1');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove me from the post by author_s1',
      }),
    );

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('s1'));
    expect(
      await screen.findByText("You're not tagged in any posts"),
    ).toBeInTheDocument();
  });

  it('says a list could not be read, instead of calling it empty', async () => {
    api.list.mockImplementation(async (status) => {
      if (status === 'PENDING') throw new Error('offline');
      return { data: { data: lists[status] } } as never;
    });
    renderWithProviders(<TagsSettings />);

    expect(
      await screen.findByText("Couldn't load your tags."),
    ).toBeInTheDocument();
    expect(screen.queryByText('No tags waiting')).not.toBeInTheDocument();
    expect(await screen.findByText('Post by author_s1')).toBeInTheDocument();
  });

  it('says so when a tag cannot be changed', async () => {
    api.remove.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<TagsSettings />);
    await screen.findByText('Post by author_s1');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove me from the post by author_s1',
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't update the tag"),
    );
    expect(screen.getByText('Post by author_s1')).toBeInTheDocument();
  });
});
