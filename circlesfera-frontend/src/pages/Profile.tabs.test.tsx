import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bookmarksApi,
  collectionsApi,
  followsApi,
  highlightsApi,
  postsApi,
  profileApi,
  storiesApi,
} from '../services';
import { renderWithProviders } from '../test/test-utils';
import Profile from './Profile';

vi.mock('../services', () => ({
  profileApi: { getProfile: vi.fn(), getMyProfile: vi.fn() },
  followsApi: { check: vi.fn(), getFollowers: vi.fn(), getFollowing: vi.fn() },
  postsApi: { getByUser: vi.fn(), getTagged: vi.fn() },
  storiesApi: { getByUser: vi.fn() },
  highlightsApi: { getProfileHighlights: vi.fn() },
  bookmarksApi: { getAll: vi.fn() },
  collectionsApi: { getAll: vi.fn(), update: vi.fn(), delete: vi.fn() },
  chatApi: { createGroup: vi.fn() },
}));
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: t, toast: t };
});
vi.mock('../components/common/SEO', () => ({ default: () => null }));
vi.mock('../components/profile/ProfileHeader', () => ({
  default: (props: { isMe: boolean }) => (
    <span>{props.isMe ? 'own header' : 'other header'}</span>
  ),
}));
vi.mock('../components/profile/PostGrid', () => ({
  default: (props: {
    items: { id: string }[];
    emptyMessage?: string;
    hasMore?: boolean;
    onLoadMore?: () => void;
  }) => (
    <div>
      <p>
        grid:{props.items.map((i) => i.id).join(',')}
        {props.items.length === 0 ? ` (${props.emptyMessage})` : ''}
      </p>
      {props.hasMore && (
        <button type="button" onClick={props.onLoadMore}>
          load more
        </button>
      )}
    </div>
  ),
}));
vi.mock('../components/collections/CollectionCard', () => ({
  default: (props: {
    collection: { id: string; name: string };
    onClick: () => void;
    onRename: (
      id: string,
      payload: { name: string; description?: string | null },
    ) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    canManage?: boolean;
  }) => (
    <div>
      <button type="button" onClick={props.onClick}>
        open {props.collection.name}
      </button>
      {props.canManage && (
        <>
          <button
            type="button"
            onClick={() =>
              void props.onRename(props.collection.id, {
                name: 'Trips',
                description: null,
              })
            }
          >
            rename {props.collection.name}
          </button>
          <button
            type="button"
            onClick={() => void props.onDelete(props.collection.id)}
          >
            delete {props.collection.name}
          </button>
        </>
      )}
    </div>
  ),
}));
vi.mock('../components/collections/CreateCollectionModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div role="dialog" aria-label="new collection">
        <button type="button" onClick={onClose}>
          close new collection
        </button>
      </div>
    ) : null,
}));
vi.mock('../components/modals/CreateHighlightModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="new highlight" /> : null,
}));

let where = '';
function Where() {
  const location = useLocation();
  where = location.pathname + location.search;
  return null;
}

const page = (ids: string[], pageNumber = 1, totalPages = 1) => ({
  data: {
    data: ids.map((id) => ({ id })),
    meta: { page: pageNumber, totalPages },
  },
});

function visit(path: string, me = 'me') {
  vi.mocked(profileApi.getMyProfile).mockResolvedValue({
    data: { username: me },
  } as never);
  return renderWithProviders(
    <>
      <Where />
      <Routes>
        <Route path="/:username" element={<Profile />} />
      </Routes>
    </>,
    { routerProps: { initialEntries: [path], useTransitions: false } },
  );
}
const tab = (name: string) => screen.getByRole('button', { name });

describe('Profile tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    where = '';
    vi.mocked(profileApi.getProfile).mockResolvedValue({
      data: {
        id: 'prof-ana',
        userId: 'user-ana',
        username: 'ana',
        isPrivate: false,
        user: { settings: { privacyLevel: 'PUBLIC' } },
      },
    } as never);
    vi.mocked(followsApi.check).mockResolvedValue({
      data: { following: false, status: 'NONE' },
    } as never);
    vi.mocked(postsApi.getByUser).mockImplementation(
      (_user, pageNumber = 1, _limit, type) =>
        Promise.resolve(
          type === 'FRAME'
            ? page(['frame-1'])
            : page([`post-${pageNumber}`], pageNumber as number, 2),
        ) as never,
    );
    vi.mocked(postsApi.getTagged).mockResolvedValue(
      page(['tagged-1']) as never,
    );
    vi.mocked(storiesApi.getByUser).mockResolvedValue({ data: [] } as never);
    vi.mocked(highlightsApi.getProfileHighlights).mockResolvedValue({
      data: [],
    } as never);
    vi.mocked(bookmarksApi.getAll).mockResolvedValue(
      page(['saved-1']) as never,
    );
    vi.mocked(collectionsApi.getAll).mockResolvedValue({
      data: [{ id: 'col-1', name: 'Travel' }],
    } as never);
    vi.mocked(collectionsApi.update).mockResolvedValue({} as never);
    vi.mocked(collectionsApi.delete).mockResolvedValue({} as never);
  });

  it('loads the next page of posts on request', async () => {
    visit('/ana');
    expect(await screen.findByText('grid:post-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'load more' }));

    expect(await screen.findByText('grid:post-1,post-2')).toBeInTheDocument();
    expect(postsApi.getByUser).toHaveBeenLastCalledWith('ana', 2, 18, 'POST');
    expect(
      screen.queryByRole('button', { name: 'load more' }),
    ).not.toBeInTheDocument();
  });

  it('shows the frames of the account at their address, asking only for frames', async () => {
    visit('/ana?tab=frames');

    expect(await screen.findByText('grid:frame-1')).toBeInTheDocument();
    expect(postsApi.getByUser).toHaveBeenCalledWith('ana', 1, 18, 'FRAME');
    expect(postsApi.getTagged).not.toHaveBeenCalled();
  });

  it('shows the posts the account is tagged in', async () => {
    visit('/ana?tab=tagged');

    expect(await screen.findByText('grid:tagged-1')).toBeInTheDocument();
    expect(postsApi.getTagged).toHaveBeenCalledWith('ana', 1, 18);
  });

  it('changes tab from the tab bar and keeps it in the address', async () => {
    visit('/ana');
    await screen.findByText('grid:post-1');

    fireEvent.click(tab('Frames'));
    expect(await screen.findByText('grid:frame-1')).toBeInTheDocument();
    expect(where).toBe('/ana?tab=frames');

    fireEvent.click(tab('Tagged'));
    expect(await screen.findByText('grid:tagged-1')).toBeInTheDocument();
    expect(where).toBe('/ana?tab=tagged');

    fireEvent.click(tab('Posts'));
    await waitFor(() => expect(where).toBe('/ana'));
  });

  it('does not offer the saved posts of someone else, even at their address', async () => {
    visit('/ana?tab=saved');

    expect(await screen.findByText('grid:post-1')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Saved' }),
    ).not.toBeInTheDocument();
    expect(bookmarksApi.getAll).not.toHaveBeenCalled();
    expect(collectionsApi.getAll).not.toHaveBeenCalled();
  });

  describe('the saved posts of the account itself', () => {
    const own = () => visit('/ana?tab=saved', 'ana');

    it('opens on the collections, without reading the saved posts yet', async () => {
      own();

      expect(
        await screen.findByRole('button', { name: 'open Travel' }),
      ).toBeInTheDocument();
      expect(screen.getByText('own header')).toBeInTheDocument();
      expect(collectionsApi.getAll).toHaveBeenCalled();
      expect(bookmarksApi.getAll).not.toHaveBeenCalled();
    });

    it('shows every saved post under "All Posts"', async () => {
      own();
      await screen.findByRole('button', { name: 'open Travel' });

      fireEvent.click(screen.getByRole('button', { name: 'All Posts' }));

      expect(await screen.findByText('grid:saved-1')).toBeInTheDocument();
      expect(bookmarksApi.getAll).toHaveBeenCalledWith(1, 18, undefined);

      fireEvent.click(screen.getByRole('button', { name: 'Collections' }));
      expect(
        await screen.findByRole('button', { name: 'open Travel' }),
      ).toBeInTheDocument();
    });

    it('opens a collection, shows its posts and goes back to the collections', async () => {
      own();

      fireEvent.click(
        await screen.findByRole('button', { name: 'open Travel' }),
      );

      expect(
        await screen.findByRole('heading', { name: 'Travel' }),
      ).toBeInTheDocument();
      expect(await screen.findByText('grid:saved-1')).toBeInTheDocument();
      expect(bookmarksApi.getAll).toHaveBeenCalledWith(1, 18, 'col-1');

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(
        await screen.findByRole('button', { name: 'open Travel' }),
      ).toBeInTheDocument();
    });

    it('says a collection is empty in its own words', async () => {
      vi.mocked(bookmarksApi.getAll).mockResolvedValue(page([]) as never);
      own();

      fireEvent.click(
        await screen.findByRole('button', { name: 'open Travel' }),
      );

      expect(
        await screen.findByText('grid: (No posts yet)'),
      ).toBeInTheDocument();
    });

    it('leaves the open collection when another tab is chosen', async () => {
      own();
      fireEvent.click(
        await screen.findByRole('button', { name: 'open Travel' }),
      );
      await screen.findByRole('heading', { name: 'Travel' });

      fireEvent.click(tab('Posts'));
      await screen.findByText('grid:post-1');
      fireEvent.click(tab('Saved'));

      expect(
        await screen.findByRole('button', { name: 'open Travel' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Travel' }),
      ).not.toBeInTheDocument();
    });

    it('renames and deletes a collection and reads the list again', async () => {
      own();
      await screen.findByRole('button', { name: 'open Travel' });

      fireEvent.click(screen.getByRole('button', { name: 'rename Travel' }));
      await waitFor(() =>
        expect(collectionsApi.update).toHaveBeenCalledWith(
          'col-1',
          expect.objectContaining({ name: 'Trips' }),
        ),
      );
      await waitFor(() =>
        expect(collectionsApi.getAll).toHaveBeenCalledTimes(2),
      );

      fireEvent.click(screen.getByRole('button', { name: 'delete Travel' }));
      await waitFor(() =>
        expect(collectionsApi.delete).toHaveBeenCalledWith('col-1'),
      );
      await waitFor(() =>
        expect(collectionsApi.getAll).toHaveBeenCalledTimes(3),
      );
    });

    it('opens the dialog that makes a new collection, and closes it', async () => {
      own();
      await screen.findByRole('button', { name: 'open Travel' });

      fireEvent.click(screen.getByRole('button', { name: /New Collection/ }));
      expect(
        await screen.findByRole('dialog', { name: 'new collection' }),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: 'close new collection' }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'new collection' }),
        ).not.toBeInTheDocument(),
      );
    });

    it('shows no collection when the list cannot be read as one', async () => {
      vi.mocked(collectionsApi.getAll).mockResolvedValue({
        data: null,
      } as never);
      own();

      await screen.findByRole('button', { name: /New Collection/ });
      expect(
        screen.queryByRole('button', { name: /^open / }),
      ).not.toBeInTheDocument();
    });
  });

  it('opens the highlight dialog from the old address of the create menu, and cleans it', async () => {
    visit('/ana?action=highlights', 'ana');

    expect(
      await screen.findByRole('dialog', { name: 'new highlight' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(where).toBe('/ana'));
  });

  it('ignores that address on the profile of someone else', async () => {
    visit('/ana?action=highlights');

    await screen.findByText('grid:post-1');
    expect(
      screen.queryByRole('dialog', { name: 'new highlight' }),
    ).not.toBeInTheDocument();
    expect(where).toBe('/ana?action=highlights');
  });
});
