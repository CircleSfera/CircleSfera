import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import CommentsTab from './CommentsTab';
import PostsTab from './PostsTab';
import StoriesTab from './StoriesTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getEnhancedStats: vi.fn(),
    getUserDetail: vi.fn(),
    getPosts: vi.fn(),
    deletePost: vi.fn(),
    exportPostsCSV: vi.fn(),
    getComments: vi.fn(),
    deleteComment: vi.fn(),
    getStories: vi.fn(),
    deleteStory: vi.fn(),
    updateModerationStatus: vi.fn(),
  },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('../../utils/adminPanel', () => ({
  platformOrigin: () => 'https://circlesfera.test',
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();

const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1) => ({
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

const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const kpi = (title: string) =>
  screen.getByText(title).parentElement as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });

beforeEach(() => {
  vi.clearAllMocks();
  api.getEnhancedStats.mockResolvedValue({
    posts: 1500,
    postGrowth: 8,
    newPostsThisWeek: 40,
    reportedContentPercent: 2.5,
    engagement: 6.1,
    pendingReports: 12,
  } as never);
});

describe('PostsTab', () => {
  const post = (id: string, over: object = {}) => ({
    id,
    caption: `Caption ${id}`,
    type: 'POST',
    createdAt: '2026-03-10T11:00:00Z',
    media: [{ url: `https://media.test/${id}.jpg`, type: 'image' }],
    moderationStatus: 'FLAGGED',
    user: { profile: { username: `author_${id}`, avatar: null } },
    _count: { likes: 5, comments: 2 },
    ...over,
  });
  const show = (entry = '/posts') =>
    renderWithProviders(<PostsTab onToast={onToast} />, {
      routerProps: { initialEntries: [entry], useTransitions: false },
    });

  beforeEach(() => {
    api.getPosts.mockResolvedValue(list([]) as never);
    api.deletePost.mockResolvedValue({} as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the flagged posts first and shows the totals', async () => {
    show();

    expect(await screen.findByText('No posts')).toBeInTheDocument();
    expect(api.getPosts).toHaveBeenCalledWith(
      1,
      10,
      undefined,
      undefined,
      undefined,
      'FLAGGED',
    );
    await waitFor(() => expect(kpi('Total posts')).toHaveTextContent('1,500'));
    expect(kpi('Total posts')).toHaveTextContent('+8%');
    expect(kpi('New (this week)')).toHaveTextContent('40');
    expect(kpi('Reported content')).toHaveTextContent('2.5%');
  });

  it('shows zeros while the totals are unknown', async () => {
    api.getEnhancedStats.mockReturnValue(new Promise(() => {}));
    show();

    await screen.findByText('No posts');
    expect(kpi('Total posts')).toHaveTextContent('0');
    expect(kpi('Reported content')).toHaveTextContent('0%');
  });

  it.each([
    ['All (Recent)', undefined, undefined],
    ['Type: Post', 'POST', undefined],
    ['Type: Frame', 'FRAME', undefined],
  ])('asks for "%s" when that group is chosen', async (label, type, status) => {
    show();
    await screen.findByText('No posts');

    fireEvent.click(screen.getByRole('button', { name: label }));

    await waitFor(() =>
      expect(api.getPosts).toHaveBeenLastCalledWith(
        1,
        10,
        undefined,
        type,
        undefined,
        status,
      ),
    );
  });

  it('searches from the first page and offers to clear an empty search', async () => {
    api.getPosts.mockImplementation((pageNumber = 1, _limit, search) =>
      Promise.resolve(
        (search
          ? list([])
          : list([post(`p${pageNumber}`)], pageNumber, 3)) as never,
      ),
    );
    show();
    await screen.findByText('Caption p1');
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Caption p2');

    fireEvent.change(screen.getByRole('textbox', { name: 'Search posts...' }), {
      target: { value: 'cats' },
    });
    await waitFor(() =>
      expect(api.getPosts).toHaveBeenLastCalledWith(
        1,
        10,
        'cats',
        undefined,
        undefined,
        'FLAGGED',
      ),
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Clear filters' }),
    );
    expect(await screen.findByText('Caption p1')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Search posts...' }),
    ).toHaveValue('');
  });

  it('lists every post of one person when it comes filtered by them', async () => {
    api.getUserDetail.mockResolvedValue({
      data: { profile: { username: 'ana' } },
    } as never);
    show('/posts?userId=u1');

    await waitFor(() =>
      expect(api.getPosts).toHaveBeenCalledWith(
        1,
        10,
        undefined,
        undefined,
        'u1',
        undefined,
      ),
    );
    expect(await screen.findByText('Filtered by @ana')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear user filter' }));
    await waitFor(() =>
      expect(api.getPosts).toHaveBeenLastCalledWith(
        1,
        10,
        undefined,
        undefined,
        undefined,
        'FLAGGED',
      ),
    );
  });

  it('shows each post with its author, type and figures', async () => {
    api.getPosts.mockResolvedValue(
      list([
        post('a'),
        post('b', {
          caption: null,
          user: null,
          media: null,
          _count: undefined,
          type: 'FRAME',
        }),
      ]) as never,
    );
    show();

    await screen.findByText('Caption a');
    const first = rowOf('Caption a');
    expect(within(first).getByText('@author_a')).toBeInTheDocument();
    expect(within(first).getByText('POST')).toBeInTheDocument();
    expect(within(first).getByText('5 likes · 2 comments')).toBeInTheDocument();
    expect(first.querySelector('img')).toHaveAttribute(
      'src',
      'https://media.test/a.jpg',
    );

    const bare = rowOf('(No caption)');
    expect(within(bare).getByText('@Unknown')).toBeInTheDocument();
    expect(within(bare).getByText('FRAME')).toBeInTheDocument();
    expect(within(bare).queryByText(/likes/)).not.toBeInTheDocument();
    expect(bare.querySelector('img')).toBeNull();
  });

  it('opens a post next to the list, with a link to it on the platform', async () => {
    api.getPosts.mockResolvedValue(
      list([
        post('a', {
          media: [
            { url: 'https://media.test/a.jpg', type: 'image' },
            { url: 'https://media.test/a2.jpg', type: 'image' },
          ],
        }),
      ]) as never,
    );
    show();
    await screen.findByText('Caption a');

    fireEvent.click(rowOf('Caption a'));

    const open = detail();
    expect(within(open).getByText('Post preview')).toBeInTheDocument();
    expect(within(open).getByText('@author_a')).toBeInTheDocument();
    expect(within(open).getByText('Caption a')).toBeInTheDocument();
    expect(within(open).getByText('1/2')).toBeInTheDocument();
    expect(within(open).getByText('Likes').previousSibling).toHaveTextContent(
      '5',
    );
    expect(
      within(open).getByText('Comments').previousSibling,
    ).toHaveTextContent('2');
    // The staff panel lives on its own host: the link must leave it.
    const link = within(open).getByRole('link', { name: 'View on platform' });
    expect(link).toHaveAttribute('href', 'https://circlesfera.test/p/a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('min-h-11');
    expect(rowOf('Caption a')).toHaveClass('border-brand-primary/30');
  });

  it('goes back to the list from the open post, by button or Escape', async () => {
    api.getPosts.mockResolvedValue(list([post('a')]) as never);
    show();
    await screen.findByText('Caption a');

    fireEvent.click(rowOf('Caption a'));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Back' }));
    expect(screen.queryByText('Post preview')).not.toBeInTheDocument();

    fireEvent.click(rowOf('Caption a'));
    expect(screen.getByText('Post preview')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('Post preview')).not.toBeInTheDocument(),
    );
  });

  it('plays a video post and says when a post has no caption or figures', async () => {
    api.getPosts.mockResolvedValue(
      list([
        post('v', {
          caption: null,
          media: [{ url: 'https://media.test/v.mp4', type: 'video' }],
          _count: undefined,
        }),
      ]) as never,
    );
    show();
    await screen.findByText('(No caption)');

    fireEvent.click(rowOf('(No caption)'));

    const open = detail();
    expect(open.querySelector('video')).toHaveAttribute(
      'src',
      'https://media.test/v.mp4',
    );
    expect(within(open).getByText('(No caption)')).toBeInTheDocument();
    expect(within(open).queryByText('Likes')).not.toBeInTheDocument();
    expect(within(open).queryByText('1/1')).not.toBeInTheDocument();
  });

  it('offers the preview and the platform from the row menu', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    api.getPosts.mockResolvedValue(list([post('a')]) as never);
    show();
    await screen.findByText('Caption a');

    fireEvent.click(
      within(rowOf('Caption a')).getByRole('button', { name: 'More actions' }),
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'View on platform' }),
    );
    expect(opened).toHaveBeenCalledWith(
      'https://circlesfera.test/p/a',
      '_blank',
      'noopener,noreferrer',
    );

    fireEvent.click(
      within(rowOf('Caption a')).getByRole('button', { name: 'More actions' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Preview' }));
    expect(within(detail()).getByText('Post preview')).toBeInTheDocument();
  });

  it('deletes a post only after confirming and closes it if it was open', async () => {
    api.getPosts.mockResolvedValue(list([post('a')]) as never);
    show();
    await screen.findByText('Caption a');
    fireEvent.click(rowOf('Caption a'));

    fireEvent.click(
      within(rowOf('Caption a')).getByRole('button', { name: 'Delete' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete this post?')).toBeInTheDocument();
    expect(api.deletePost).not.toHaveBeenCalled();

    api.getPosts.mockResolvedValue(list([]) as never);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deletePost).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Post deleted', 'success'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('No posts')).toBeInTheDocument();
    expect(screen.queryByText('Post preview')).not.toBeInTheDocument();
    expect(api.getEnhancedStats).toHaveBeenCalledTimes(2);
  });

  it('deletes nothing on cancel and says so when deleting fails', async () => {
    api.deletePost.mockRejectedValue(new Error('no'));
    api.getPosts.mockResolvedValue(list([post('a')]) as never);
    show();
    await screen.findByText('Caption a');

    fireEvent.click(
      within(rowOf('Caption a')).getByRole('button', { name: 'Delete' }),
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.deletePost).not.toHaveBeenCalled();

    fireEvent.click(
      within(rowOf('Caption a')).getByRole('button', { name: 'Delete' }),
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to delete post', 'error'),
    );
    expect(screen.getByText('Caption a')).toBeInTheDocument();
  });

  it('downloads the posts as a file and says so', async () => {
    const created = vi.fn(() => 'blob:posts');
    const revoked = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: created,
      revokeObjectURL: revoked,
    });
    let name = '';
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        name = this.download;
      });
    api.exportPostsCSV.mockResolvedValue({ data: 'id,caption\n1,hi' } as never);
    show();
    await screen.findByText('No posts');

    fireEvent.click(
      screen.getByRole('button', { name: 'Export posts as CSV' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('CSV downloaded', 'success'),
    );
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(name).toBe('circlesfera-posts.csv');
    expect((created.mock.calls[0] as unknown as [Blob])[0].type).toBe(
      'text/csv',
    );
    expect(revoked).toHaveBeenCalledWith('blob:posts');
    vi.unstubAllGlobals();
  });

  it('says so when the file cannot be produced', async () => {
    api.exportPostsCSV.mockRejectedValue(new Error('no'));
    show();
    await screen.findByText('No posts');

    fireEvent.click(
      screen.getByRole('button', { name: 'Export posts as CSV' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to export CSV', 'error'),
    );
  });
});

describe('CommentsTab', () => {
  const comment = (id: string, over: object = {}) => ({
    id,
    content: `Comment ${id}`,
    createdAt: '2026-03-10T11:00:00Z',
    user: { profile: { username: `writer_${id}`, avatar: null } },
    moderationStatus: 'FLAGGED',
    ...over,
  });
  const show = (entry = '/comments') =>
    renderWithProviders(<CommentsTab onToast={onToast} />, {
      routerProps: { initialEntries: [entry], useTransitions: false },
    });

  beforeEach(() => {
    api.getComments.mockResolvedValue(list([]) as never);
    api.deleteComment.mockResolvedValue({} as never);
    api.updateModerationStatus.mockResolvedValue({} as never);
  });

  it('asks for the flagged comments first and shows the totals', async () => {
    show();

    expect(await screen.findByText('No comments')).toBeInTheDocument();
    expect(api.getComments).toHaveBeenCalledWith(
      1,
      10,
      undefined,
      undefined,
      'FLAGGED',
    );
    await waitFor(() =>
      expect(kpi('Global engagement rate')).toHaveTextContent('6.1%'),
    );
    expect(kpi('Pending reports (moderation)')).toHaveTextContent('12');
  });

  it('shows zeros while the totals are unknown', async () => {
    api.getEnhancedStats.mockReturnValue(new Promise(() => {}));
    show();

    await screen.findByText('No comments');
    expect(kpi('Global engagement rate')).toHaveTextContent('0%');
    expect(kpi('Pending reports (moderation)')).toHaveTextContent('0');
  });

  it('asks for every comment, a search or one person on request', async () => {
    api.getUserDetail.mockResolvedValue({
      data: { profile: { username: 'ana' } },
    } as never);
    api.getComments.mockImplementation((pageNumber = 1, _limit, search) =>
      Promise.resolve(
        (search
          ? list([])
          : list([comment(`c${pageNumber}`)], pageNumber, 2)) as never,
      ),
    );
    show('/comments?userId=u1');

    await waitFor(() =>
      expect(api.getComments).toHaveBeenCalledWith(
        1,
        10,
        undefined,
        'u1',
        undefined,
      ),
    );
    expect(await screen.findByText('Filtered by @ana')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear user filter' }));
    await waitFor(() =>
      expect(api.getComments).toHaveBeenLastCalledWith(
        1,
        10,
        undefined,
        undefined,
        'FLAGGED',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'All (Recent)' }));
    await waitFor(() =>
      expect(api.getComments).toHaveBeenLastCalledWith(
        1,
        10,
        undefined,
        undefined,
        undefined,
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await screen.findByText('Comment c2');
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search comments...' }),
      { target: { value: 'spam' } },
    );
    await waitFor(() =>
      expect(api.getComments).toHaveBeenLastCalledWith(
        1,
        10,
        'spam',
        undefined,
        undefined,
      ),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Clear filters' }),
    );
    expect(await screen.findByText('Comment c1')).toBeInTheDocument();
  });

  it('shows each comment with who wrote it', async () => {
    api.getComments.mockResolvedValue(
      list([comment('a'), comment('b', { content: '', user: null })]) as never,
    );
    show();

    await screen.findByText('Comment a');
    const first = rowOf('Comment a');
    expect(within(first).getByText(/^@writer_a • /)).toBeInTheDocument();
    expect(within(first).getByText('W')).toBeInTheDocument();
    const bare = rowOf('No content');
    expect(within(bare).getByText(/^@Unknown • /)).toBeInTheDocument();
    expect(within(bare).getByText('?')).toBeInTheDocument();
  });

  it('hides a comment from its row without opening it', async () => {
    api.getComments.mockResolvedValue(list([comment('a')]) as never);
    show();
    await screen.findByText('Comment a');

    fireEvent.click(
      within(rowOf('Comment a')).getByRole('button', { name: 'Hide' }),
    );

    await waitFor(() =>
      expect(api.updateModerationStatus).toHaveBeenCalledWith(
        'COMMENT',
        'a',
        'HIDDEN',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Comment hidden', 'success'),
    );
    expect(api.deleteComment).not.toHaveBeenCalled();
    expect(screen.queryByText('Comment detail')).not.toBeInTheDocument();
    expect(api.getComments).toHaveBeenCalledTimes(2);
  });

  it('opens a comment and goes back to the list once it is hidden from the queue', async () => {
    api.getComments.mockResolvedValue(list([comment('a')]) as never);
    show();
    await screen.findByText('Comment a');

    fireEvent.click(rowOf('Comment a'));
    const open = detail();
    expect(within(open).getByText('Comment detail')).toBeInTheDocument();
    expect(within(open).getByText('Comment a')).toBeInTheDocument();

    // Hidden, it is no longer among the flagged ones.
    api.getComments.mockResolvedValue(list([]) as never);
    fireEvent.click(within(open).getByRole('button', { name: 'Hide' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Comment hidden', 'success'),
    );
    expect(await screen.findByText('No comments')).toBeInTheDocument();
    expect(screen.queryByText('Comment detail')).not.toBeInTheDocument();
  });

  it('goes back to the list from the open comment, by button or Escape', async () => {
    api.getComments.mockResolvedValue(list([comment('a')]) as never);
    show();
    await screen.findByText('Comment a');

    fireEvent.click(rowOf('Comment a'));
    fireEvent.click(within(detail()).getByRole('button', { name: 'Back' }));
    expect(screen.queryByText('Comment detail')).not.toBeInTheDocument();

    fireEvent.click(rowOf('Comment a'));
    expect(screen.getByText('Comment detail')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByText('Comment detail')).not.toBeInTheDocument(),
    );
  });

  it('deletes the open comment after confirming and closes it', async () => {
    api.getComments.mockResolvedValue(
      list([comment('a', { content: '' })]) as never,
    );
    show();
    await screen.findByText('No content');
    fireEvent.click(rowOf('No content'));
    expect(within(detail()).getByText('No content')).toBeInTheDocument();

    fireEvent.click(within(detail()).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Delete this comment?'),
    ).toBeInTheDocument();
    api.getComments.mockResolvedValue(list([]) as never);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Comment deleted', 'success'),
    );
    expect(api.updateModerationStatus).not.toHaveBeenCalled();
    expect(screen.queryByText('Comment detail')).not.toBeInTheDocument();
  });

  it('deletes nothing on cancel', async () => {
    api.getComments.mockResolvedValue(list([comment('a')]) as never);
    show();
    await screen.findByText('Comment a');

    fireEvent.click(
      within(rowOf('Comment a')).getByRole('button', { name: 'Delete' }),
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.deleteComment).not.toHaveBeenCalled();
  });

  it('says which action failed', async () => {
    api.deleteComment.mockRejectedValue(new Error('no'));
    api.updateModerationStatus.mockRejectedValue(new Error('no'));
    api.getComments.mockResolvedValue(list([comment('a')]) as never);
    show();
    await screen.findByText('Comment a');

    fireEvent.click(
      within(rowOf('Comment a')).getByRole('button', { name: 'Hide' }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Could not hide comment', 'error'),
    );

    fireEvent.click(
      within(rowOf('Comment a')).getByRole('button', { name: 'Delete' }),
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to delete comment', 'error'),
    );
    expect(screen.getByText('Comment a')).toBeInTheDocument();
  });
});

describe('StoriesTab', () => {
  const NOW = new Date('2026-03-10T12:00:00Z');
  const story = (id: string, over: object = {}) => ({
    id,
    url: `https://media.test/${id}.jpg`,
    mediaType: 'image',
    expiresAt: '2026-03-11T12:00:00Z',
    createdAt: '2026-03-10T11:00:00Z',
    user: { profile: { username: `teller_${id}`, avatar: null } },
    _count: { views: 30, reactions: 4 },
    moderationStatus: 'FLAGGED',
    ...over,
  });
  const show = (entry = '/stories') =>
    renderWithProviders(<StoriesTab onToast={onToast} />, {
      routerProps: { initialEntries: [entry], useTransitions: false },
    });
  /** The phone card of one story; the table repeats the same data. */
  const card = (username: string) => rowCard(`@${username}`);
  const rowCard = (title: string) =>
    screen
      .getAllByText(title)
      .map((el) => el.closest('.relative.flex'))
      .find(Boolean) as HTMLElement;
  const tableRow = (username: string) =>
    screen
      .getAllByText((_text, el) => el?.textContent === `@${username}`)
      .map((el) => el.closest('tr'))
      .find(Boolean) as HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    api.getStories.mockResolvedValue(list([]) as never);
    api.deleteStory.mockResolvedValue({} as never);
    api.updateModerationStatus.mockResolvedValue({} as never);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for the flagged stories first and says when there are none', async () => {
    show();

    expect(await screen.findByText('No stories')).toBeInTheDocument();
    expect(api.getStories).toHaveBeenCalledWith(1, 10, {
      expired: undefined,
      moderationStatus: 'FLAGGED',
      userId: undefined,
    });
    expect(screen.getByRole('combobox', { name: 'Moderation' })).toHaveValue(
      'FLAGGED',
    );
  });

  it('asks again from the first page when a filter changes', async () => {
    api.getStories.mockImplementation((pageNumber = 1) =>
      Promise.resolve(list([story(`s${pageNumber}`)], pageNumber, 3) as never),
    );
    show();
    await screen.findAllByText('@teller_s1');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findAllByText('@teller_s2');

    fireEvent.change(screen.getByRole('combobox', { name: 'Expiry' }), {
      target: { value: 'true' },
    });
    await waitFor(() =>
      expect(api.getStories).toHaveBeenLastCalledWith(1, 10, {
        expired: 'true',
        moderationStatus: 'FLAGGED',
        userId: undefined,
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.getStories).toHaveBeenLastCalledWith(2, 10, {
        expired: 'true',
        moderationStatus: 'FLAGGED',
        userId: undefined,
      }),
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Moderation' }), {
      target: { value: '' },
    });
    await waitFor(() =>
      expect(api.getStories).toHaveBeenLastCalledWith(1, 10, {
        expired: 'true',
        moderationStatus: undefined,
        userId: undefined,
      }),
    );
  });

  it('lists every story of one person when it comes filtered by them', async () => {
    api.getUserDetail.mockResolvedValue({
      data: { profile: { username: 'ana' } },
    } as never);
    show('/stories?userId=u1');

    await waitFor(() =>
      expect(api.getStories).toHaveBeenCalledWith(1, 10, {
        expired: undefined,
        moderationStatus: undefined,
        userId: 'u1',
      }),
    );
    expect(await screen.findByText('Filtered by @ana')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear user filter' }));
    await waitFor(() =>
      expect(api.getStories).toHaveBeenLastCalledWith(1, 10, {
        expired: undefined,
        moderationStatus: 'FLAGGED',
        userId: undefined,
      }),
    );
  });

  it('shows each story with its state, on the phone card and in the table', async () => {
    api.getStories.mockResolvedValue(
      list([
        story('a'),
        story('b', {
          mediaType: 'video',
          url: 'https://media.test/b.mp4',
          expiresAt: '2026-03-10T11:59:00Z',
          moderationStatus: 'HIDDEN',
          user: null,
          _count: undefined,
        }),
      ]) as never,
    );
    show();
    await screen.findAllByText('@teller_a');

    for (const place of [card('teller_a'), tableRow('teller_a')]) {
      expect(within(place).getByText('FLAGGED')).toHaveClass('text-amber-400');
      expect(within(place).getByText('Active')).toBeInTheDocument();
      expect(within(place).getByText('image')).toBeInTheDocument();
      expect(place.querySelector('img')).toHaveAttribute(
        'src',
        'https://media.test/a.jpg',
      );
      expect(
        within(place).getByRole('button', { name: 'Hide' }),
      ).toBeInTheDocument();
      expect(
        within(place).queryByRole('button', { name: 'Restore' }),
      ).not.toBeInTheDocument();
    }
    expect(card('teller_a')).toHaveTextContent('30 views');
    expect(card('teller_a')).toHaveTextContent('· 4');
    expect(tableRow('teller_a')).toHaveTextContent('Active 30 4');

    for (const place of [card('Unknown'), tableRow('Unknown')]) {
      expect(within(place).getByText('HIDDEN')).toHaveClass('text-white/50');
      expect(within(place).getByText('Expired')).toBeInTheDocument();
      expect(place.querySelector('video')).toHaveAttribute(
        'src',
        'https://media.test/b.mp4',
      );
      expect(
        within(place).getByRole('button', { name: 'Restore' }),
      ).toBeInTheDocument();
    }
    expect(card('Unknown')).toHaveTextContent('0 views');
  });

  it('hides a visible story and restores a hidden one', async () => {
    api.getStories.mockResolvedValue(
      list([story('a'), story('b', { moderationStatus: 'HIDDEN' })]) as never,
    );
    show();
    await screen.findAllByText('@teller_a');

    fireEvent.click(
      within(card('teller_a')).getByRole('button', { name: 'Hide' }),
    );
    await waitFor(() =>
      expect(api.updateModerationStatus).toHaveBeenCalledWith(
        'STORY',
        'a',
        'HIDDEN',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Story hidden', 'success'),
    );

    fireEvent.click(
      within(tableRow('teller_b')).getByRole('button', { name: 'Restore' }),
    );
    await waitFor(() =>
      expect(api.updateModerationStatus).toHaveBeenLastCalledWith(
        'STORY',
        'b',
        'VISIBLE',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Story restored', 'success'),
    );
    expect(api.getStories).toHaveBeenCalledTimes(3);
  });

  it('deletes a story only after confirming', async () => {
    api.getStories.mockResolvedValue(list([story('a')]) as never);
    show();
    await screen.findAllByText('@teller_a');

    fireEvent.click(
      within(card('teller_a')).getByRole('button', { name: 'Delete' }),
    );
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete this story?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.deleteStory).not.toHaveBeenCalled();

    fireEvent.click(
      within(card('teller_a')).getByRole('button', { name: 'Delete' }),
    );
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteStory).toHaveBeenCalledWith('a'));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Story deleted', 'success'),
    );
    expect(api.getStories).toHaveBeenCalledTimes(2);
  });

  it('says which action failed', async () => {
    api.deleteStory.mockRejectedValue(new Error('no'));
    api.updateModerationStatus.mockRejectedValue(new Error('no'));
    api.getStories.mockResolvedValue(list([story('a')]) as never);
    show();
    await screen.findAllByText('@teller_a');

    fireEvent.click(
      within(card('teller_a')).getByRole('button', { name: 'Hide' }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Failed to update story moderation',
        'error',
      ),
    );

    fireEvent.click(
      within(card('teller_a')).getByRole('button', { name: 'Delete' }),
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Failed to delete story', 'error'),
    );
    expect(api.getStories).toHaveBeenCalledTimes(1);
  });
});
