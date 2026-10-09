import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameMenuActions } from '../components/frames/FrameOptionsSheet';
import { postsApi } from '../services';
import { renderWithProviders } from '../test/test-utils';
import type { Post } from '../types';
import Frames from './Frames';

const session = vi.hoisted(() => ({
  profile: { id: 'me', accountType: 'PERSONAL' } as {
    id: string;
    accountType: string;
  },
}));

const menu = vi.hoisted(() => ({
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onReport: vi.fn(),
  onSave: vi.fn(),
  onPromote: vi.fn(),
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: typeof session) => unknown) => selector(session),
}));

vi.mock('../services', () => ({
  postsApi: { getFrames: vi.fn(), getById: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../components/FrameItem', async () => {
  const { useEffect } = await import('react');
  return {
    default: (props: {
      post: Post;
      isActive: boolean;
      isNext?: boolean;
      onCommentsOpen: () => void;
      onShareOpen: () => void;
      onSaveOpen: () => void;
      onMenuOpen: () => void;
      onRegisterMenuActions?: (actions: FrameMenuActions | null) => void;
    }) => {
      const { isActive, onRegisterMenuActions } = props;
      useEffect(() => {
        if (!isActive || !onRegisterMenuActions) return;
        onRegisterMenuActions(menu);
        return () => onRegisterMenuActions(null);
      }, [isActive, onRegisterMenuActions]);
      return (
        <div
          data-testid={`frame-${props.post.id}`}
          data-active={String(props.isActive)}
          data-next={String(!!props.isNext)}
        >
          {props.isActive && (
            <>
              <button type="button" onClick={props.onCommentsOpen}>
                comments
              </button>
              <button type="button" onClick={props.onShareOpen}>
                share
              </button>
              <button type="button" onClick={props.onSaveOpen}>
                save
              </button>
              <button type="button" onClick={props.onMenuOpen}>
                menu
              </button>
            </>
          )}
        </div>
      );
    },
  };
});

vi.mock('../components/modals/FrameCommentsModal', () => ({
  default: ({ postId, variant }: { postId: string; variant: string }) => (
    <div data-testid={`comments-${variant}`}>{postId}</div>
  ),
}));
vi.mock('../components/modals/SharePostModal', () => ({
  default: ({ post }: { post: Post }) => (
    <div data-testid="share">{post.id}</div>
  ),
}));
vi.mock('../components/modals/AddToCollectionModal', () => ({
  default: ({ postId }: { postId: string }) => (
    <div data-testid="collection">{postId}</div>
  ),
}));
vi.mock('../components/frames/FrameOptionsSheet', () => ({
  default: (props: {
    isOwner: boolean;
    onPromote?: () => void;
    onDelete: () => void;
  }) => (
    <div data-testid="options" data-owner={String(props.isOwner)}>
      {props.onPromote && <span>promote</span>}
    </div>
  ),
}));

function frame(id: string, over: Partial<Post> = {}): Post {
  return {
    id,
    type: 'FRAME',
    profileId: 'author',
    profile: { id: 'author', username: 'ana' },
    media: [{ type: 'video', url: `https://media.test/${id}.mp4` }],
    ...over,
  } as Post;
}

function page(frames: Post[], pageNumber = 1, totalPages = 1) {
  return {
    data: { data: frames, meta: { page: pageNumber, totalPages } },
  } as never;
}

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.search}</output>;
}

function open(address = '/frames') {
  return renderWithProviders(
    <>
      <Frames />
      <Address />
    </>,
    { routerProps: { initialEntries: [address] } },
  );
}

let observer: IntersectionObserverCallback;
let scrolled: { index: string | null; options: unknown }[];

/** The browser reports that this frame fills the screen. */
function scrollTo(index: number) {
  const target = document.querySelector(`[data-index="${index}"]`);
  if (!target) throw new Error(`no frame at ${index}`);
  act(() =>
    observer(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}

const active = () =>
  document
    .querySelector('[data-active="true"]')
    ?.getAttribute('data-testid')
    ?.replace('frame-', '');

describe('Frames', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.profile = { id: 'me', accountType: 'PERSONAL' };
    scrolled = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        constructor(callback: IntersectionObserverCallback) {
          observer = callback;
        }
      },
    );
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
      run(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Element.prototype.scrollIntoView = function (options?: unknown) {
      scrolled.push({ index: this.getAttribute('data-index'), options });
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says there is nothing yet when nobody has posted a frame', async () => {
    vi.mocked(postsApi.getFrames).mockResolvedValue(page([]));
    open();

    expect(await screen.findByText('No Frames Yet')).toBeInTheDocument();
    expect(postsApi.getFrames).toHaveBeenCalledWith(1, 10);
  });

  it('offers to try again when the frames cannot be loaded', async () => {
    vi.mocked(postsApi.getFrames).mockRejectedValueOnce(new Error('down'));
    open();
    expect(
      await screen.findByText('Could not load Frames'),
    ).toBeInTheDocument();

    vi.mocked(postsApi.getFrames).mockResolvedValue(page([frame('a')]));
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(await screen.findByTestId('frame-a')).toBeInTheDocument();
  });

  it('plays the first one and only prepares the ones around it', async () => {
    vi.mocked(postsApi.getFrames).mockResolvedValue(
      page(['a', 'b', 'c', 'd', 'e'].map((id) => frame(id))),
    );
    open();

    expect(await screen.findByTestId('frame-a')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByTestId('frame-b')).toHaveAttribute('data-next', 'true');
    expect(screen.getByTestId('frame-c')).toHaveAttribute(
      'data-active',
      'false',
    );
    // Further away there is only a placeholder.
    expect(screen.queryByTestId('frame-d')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-index]')).toHaveLength(5);
  });

  it('follows the scroll and closes what was open on the previous frame', async () => {
    vi.mocked(postsApi.getFrames).mockResolvedValue(
      page(['a', 'b', 'c', 'd'].map((id) => frame(id))),
    );
    open();
    await screen.findByTestId('frame-a');
    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    expect(screen.getByTestId('share')).toHaveTextContent('a');

    scrollTo(1);

    expect(active()).toBe('b');
    expect(screen.queryByTestId('share')).not.toBeInTheDocument();
    expect(screen.getByTestId('frame-d')).toBeInTheDocument();
  });

  it('opens one panel at a time, each about the frame on screen', async () => {
    vi.mocked(postsApi.getFrames).mockResolvedValue(
      page([frame('a'), frame('b')]),
    );
    open();
    await screen.findByTestId('frame-a');

    fireEvent.click(screen.getByRole('button', { name: 'comments' }));
    expect(screen.getByTestId('comments-drawer')).toHaveTextContent('a');
    expect(screen.getByTestId('comments-sidebar')).toHaveTextContent('a');

    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(screen.getByTestId('collection')).toHaveTextContent('a');
    expect(screen.queryByTestId('comments-drawer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'menu' }));
    expect(screen.getByTestId('options')).toBeInTheDocument();
    expect(screen.queryByTestId('collection')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    expect(screen.getByTestId('share')).toHaveTextContent('a');
    expect(screen.queryByTestId('options')).not.toBeInTheDocument();
  });

  describe('the menu', () => {
    async function openMenu(frames: Post[]) {
      vi.mocked(postsApi.getFrames).mockResolvedValue(page(frames));
      open();
      await screen.findByTestId(`frame-${frames[0].id}`);
      fireEvent.click(screen.getByRole('button', { name: 'menu' }));
      return screen.getByTestId('options');
    }

    it("treats a visitor as a visitor on someone else's frame", async () => {
      session.profile = { id: 'me', accountType: 'CREATOR' };

      const options = await openMenu([frame('a')]);

      expect(options).toHaveAttribute('data-owner', 'false');
      expect(screen.queryByText('promote')).not.toBeInTheDocument();
    });

    it('offers promoting to a creator on their own frame', async () => {
      session.profile = { id: 'me', accountType: 'CREATOR' };

      const options = await openMenu([frame('a', { profileId: 'me' })]);

      expect(options).toHaveAttribute('data-owner', 'true');
      expect(screen.getByText('promote')).toBeInTheDocument();
    });

    it('does not offer promoting to a personal account', async () => {
      await openMenu([frame('a', { profileId: 'me' })]);

      expect(screen.queryByText('promote')).not.toBeInTheDocument();
    });
  });

  describe('loading more', () => {
    it('asks for the next page when three or fewer frames are left', async () => {
      vi.mocked(postsApi.getFrames).mockImplementation(((pageNumber: number) =>
        Promise.resolve(
          pageNumber === 1
            ? page(
                ['a', 'b', 'c', 'd', 'e'].map((id) => frame(id)),
                1,
                2,
              )
            : page([frame('f')], 2, 2),
        )) as never);
      open();
      await screen.findByTestId('frame-a');

      scrollTo(1);
      expect(postsApi.getFrames).toHaveBeenCalledTimes(1);

      scrollTo(2);

      await waitFor(() =>
        expect(postsApi.getFrames).toHaveBeenCalledWith(2, 10),
      );
      await waitFor(() =>
        expect(document.querySelectorAll('[data-index]')).toHaveLength(6),
      );
    });

    it('does not ask again on the last page', async () => {
      vi.mocked(postsApi.getFrames).mockResolvedValue(
        page([frame('a'), frame('b')]),
      );
      open();
      await screen.findByTestId('frame-a');

      scrollTo(1);

      expect(postsApi.getFrames).toHaveBeenCalledTimes(1);
    });
  });

  describe('a link to one frame', () => {
    it('puts it first when it is not among the loaded ones', async () => {
      vi.mocked(postsApi.getFrames).mockResolvedValue(page([frame('a')]));
      vi.mocked(postsApi.getById).mockResolvedValue({
        data: frame('linked'),
      } as never);
      open('/frames?post=linked');

      expect(await screen.findByTestId('frame-linked')).toHaveAttribute(
        'data-active',
        'true',
      );
      expect(postsApi.getById).toHaveBeenCalledWith('linked');
      expect(
        [...document.querySelectorAll('[data-testid^="frame-"]')].map((el) =>
          el.getAttribute('data-testid'),
        ),
      ).toEqual(['frame-linked', 'frame-a']);
    });

    it('goes to it where it already is, without showing it twice', async () => {
      vi.mocked(postsApi.getFrames).mockResolvedValue(
        page([frame('a'), frame('b'), frame('c')]),
      );
      vi.mocked(postsApi.getById).mockResolvedValue({
        data: frame('c'),
      } as never);
      open('/frames?post=c');

      await waitFor(() => expect(active()).toBe('c'));
      expect(document.querySelectorAll('[data-index]')).toHaveLength(3);
      expect(scrolled.at(-1)?.index).toBe('2');
    });

    it('does not add a post that is not a frame', async () => {
      vi.mocked(postsApi.getFrames).mockResolvedValue(page([frame('a')]));
      vi.mocked(postsApi.getById).mockResolvedValue({
        data: frame('photo', { type: 'POST' } as never),
      } as never);
      open('/frames?post=photo');

      expect(await screen.findByTestId('frame-a')).toBeInTheDocument();
      await waitFor(() => expect(postsApi.getById).toHaveBeenCalled());
      expect(screen.queryByTestId('frame-photo')).not.toBeInTheDocument();
    });

    it('waits for it when there are no other frames', async () => {
      vi.mocked(postsApi.getFrames).mockResolvedValue(page([]));
      let deliver: (value: unknown) => void = () => {};
      vi.mocked(postsApi.getById).mockReturnValue(
        new Promise((resolve) => {
          deliver = resolve;
        }) as never,
      );
      open('/frames?post=linked');

      await waitFor(() => expect(postsApi.getById).toHaveBeenCalled());
      expect(screen.queryByText('No Frames Yet')).not.toBeInTheDocument();

      await act(async () => deliver({ data: frame('linked') }));

      expect(await screen.findByTestId('frame-linked')).toBeInTheDocument();
    });
  });

  describe('coming back from a payment', () => {
    it('confirms it, refreshes the frames and cleans the address', async () => {
      vi.mocked(postsApi.getFrames).mockResolvedValue(page([frame('a')]));
      vi.mocked(postsApi.getById).mockResolvedValue({
        data: frame('a'),
      } as never);
      open('/frames?post=a&success=true&session_id=cs_1');

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Payment successful. Content will unlock shortly.',
        ),
      );
      expect(toast.success).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('address')).toHaveTextContent('?post=a');
      expect(screen.getByTestId('address')).not.toHaveTextContent('success');
      expect(screen.getByTestId('address')).not.toHaveTextContent('session_id');
    });

    it('says so when the payment was cancelled', async () => {
      vi.mocked(postsApi.getFrames).mockResolvedValue(page([frame('a')]));
      open('/frames?canceled=true');

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Checkout was canceled.'),
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByTestId('address')).toBeEmptyDOMElement();
    });
  });

  describe('the arrow keys', () => {
    beforeEach(() => {
      vi.mocked(postsApi.getFrames).mockResolvedValue(
        page([frame('a'), frame('b'), frame('c')]),
      );
    });

    it('go to the next and the previous frame', async () => {
      open();
      await screen.findByTestId('frame-a');

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(scrolled.at(-1)).toEqual({
        index: '1',
        options: { behavior: 'smooth' },
      });

      scrollTo(1);
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      expect(scrolled.at(-1)?.index).toBe('0');
    });

    it('stop at both ends', async () => {
      open();
      await screen.findByTestId('frame-a');

      fireEvent.keyDown(window, { key: 'ArrowUp' });
      expect(scrolled.at(-1)?.index).toBe('0');

      scrollTo(2);
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(scrolled.at(-1)?.index).toBe('2');
    });

    it('are left alone while someone is typing', async () => {
      open();
      await screen.findByTestId('frame-a');
      const field = document.createElement('textarea');
      document.body.appendChild(field);
      field.focus();

      fireEvent.keyDown(window, { key: 'ArrowDown' });

      expect(scrolled).toHaveLength(0);
      field.remove();
    });
  });
});
