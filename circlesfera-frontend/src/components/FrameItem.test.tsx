import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { forwardRef, type VideoHTMLAttributes } from 'react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarksApi, followsApi, likesApi, postsApi } from '../services';
import { creatorApi } from '../services/creator.service';
import { monetizationApi } from '../services/monetization.service';
import { useFrameStore } from '../stores/frameStore';
import { renderWithProviders } from '../test/test-utils';
import type { Post } from '../types';
import FrameItem from './FrameItem';
import type { FrameMenuActions } from './frames/FrameOptionsSheet';

const session = vi.hoisted(() => ({
  profile: { id: 'me', accountType: 'PERSONAL' } as {
    id: string;
    accountType: string;
  },
}));

/** The unlock handler the paywall last received. */
const paywall = vi.hoisted(() => ({ unlock: () => {} }));

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: typeof session) => unknown) => selector(session),
}));

vi.mock('../services', () => ({
  bookmarksApi: { check: vi.fn() },
  followsApi: { toggle: vi.fn() },
  likesApi: { check: vi.fn(), toggle: vi.fn() },
  postsApi: { delete: vi.fn(), update: vi.fn() },
}));

vi.mock('../services/creator.service', () => ({
  creatorApi: {
    trackFrameWatch: vi.fn(),
    trackFrameLoop: vi.fn(),
    recordPromotionView: vi.fn(),
  },
}));

vi.mock('../services/monetization.service', () => ({
  monetizationApi: { unlockPost: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../hooks/useSyncedLibraryAudio', () => ({
  useSyncedLibraryAudio: vi.fn(),
}));

vi.mock('./common/HlsVideoPlayer', () => ({
  default: forwardRef<
    HTMLVideoElement,
    VideoHTMLAttributes<HTMLVideoElement> & {
      isNext?: boolean;
      hlsUrl?: string;
    }
  >(({ isNext: _isNext, hlsUrl, children, ...props }, ref) => (
    <video ref={ref} data-testid="frame-video" data-hls={hlsUrl} {...props}>
      {children}
    </video>
  )),
}));

vi.mock('./frames/FrameOverlayInfo', () => ({
  default: ({ onFollow }: { onFollow: () => void }) => (
    <button type="button" onClick={onFollow}>
      follow
    </button>
  ),
}));

vi.mock('./frames/FrameActionRail', () => ({
  default: (props: {
    likesCount: number;
    isBookmarked: boolean;
    onLikeToggle: (liked: boolean) => void;
    onCommentsOpen: () => void;
    onShareOpen: () => void;
    onBookmarkOpen: () => void;
    onMenuToggle: () => void;
  }) => (
    <div>
      <span data-testid="likes">{props.likesCount}</span>
      <span data-testid="saved">{String(props.isBookmarked)}</span>
      <button type="button" onClick={() => props.onLikeToggle(true)}>
        like
      </button>
      <button type="button" onClick={() => props.onLikeToggle(false)}>
        unlike
      </button>
      <button type="button" onClick={props.onCommentsOpen}>
        comments
      </button>
      <button type="button" onClick={props.onShareOpen}>
        share
      </button>
      <button type="button" onClick={props.onBookmarkOpen}>
        save
      </button>
      <button type="button" onClick={props.onMenuToggle}>
        menu
      </button>
    </div>
  ),
}));

vi.mock('./modals/ReportModal', () => ({
  default: ({ isOpen, targetId }: { isOpen: boolean; targetId: string }) =>
    isOpen ? <div data-testid="report">{targetId}</div> : null,
}));

vi.mock('./creator/PromoteModal', () => ({
  default: ({ post }: { post: Post }) => (
    <div data-testid="promote">{post.id}</div>
  ),
}));

vi.mock('./monetization/PaywallOverlay', () => ({
  default: ({ price, onUnlock }: { price: number; onUnlock: () => void }) => {
    paywall.unlock = onUnlock;
    return <span>unlock for {price}</span>;
  },
}));

function frame(over: Partial<Post> = {}): Post {
  return {
    id: 'f1',
    type: 'FRAME',
    profileId: 'author',
    profile: { id: 'author', username: 'ana' },
    media: [{ type: 'video', url: 'https://media.test/f1.mp4' }],
    _count: { likes: 3, comments: 0 },
    ...over,
  } as Post;
}

/** What the browser would know about each video element. */
const playing = new WeakMap<HTMLMediaElement, boolean>();
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let observers: {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
}[];

const video = () => screen.getByTestId<HTMLVideoElement>('frame-video');

/** The player reports where the video is. */
function reportTime(currentTime: number, duration = 20) {
  Object.defineProperty(video(), 'duration', {
    configurable: true,
    value: duration,
  });
  video().currentTime = currentTime;
  fireEvent.timeUpdate(video());
}

function show(
  post: Post,
  props: Partial<Parameters<typeof FrameItem>[0]> = {},
) {
  return renderWithProviders(<FrameItem post={post} isActive {...props} />);
}

describe('FrameItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.profile = { id: 'me', accountType: 'PERSONAL' };
    useFrameStore.setState({ isMuted: true });
    vi.mocked(bookmarksApi.check).mockResolvedValue({
      data: { bookmarked: false },
    } as never);
    vi.mocked(likesApi.check).mockResolvedValue({
      data: { liked: false },
    } as never);
    vi.mocked(likesApi.toggle).mockResolvedValue({
      data: { liked: true },
    } as never);

    play = vi.fn(function (this: HTMLMediaElement) {
      playing.set(this, true);
      return Promise.resolve();
    });
    pause = vi.fn(function (this: HTMLMediaElement) {
      playing.set(this, false);
    });
    HTMLMediaElement.prototype.play = play as never;
    HTMLMediaElement.prototype.pause = pause as never;
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return !playing.get(this);
      },
    });

    observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        constructor(callback: IntersectionObserverCallback) {
          observers.push({ callback, disconnect: this.disconnect });
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('playback', () => {
    it('starts the frame on screen from the beginning, silent by default', () => {
      show(frame());

      expect(play).toHaveBeenCalledTimes(1);
      expect(video().muted).toBe(true);
      expect(video().currentTime).toBe(0);
    });

    it('plays with sound once the viewer has switched it on', () => {
      useFrameStore.setState({ isMuted: false });
      show(frame());

      expect(video().muted).toBe(false);
    });

    it('silences the video itself when a library track plays over it', () => {
      useFrameStore.setState({ isMuted: false });
      show(frame({ audio: { url: 'https://media.test/track.mp3' } } as never));

      expect(video().muted).toBe(true);
    });

    it('does not start a frame that is not on screen', () => {
      show(frame(), { isActive: false });

      expect(play).not.toHaveBeenCalled();
      expect(pause).toHaveBeenCalled();
    });

    it('falls back to silent playback when the browser refuses sound', async () => {
      useFrameStore.setState({ isMuted: false });
      play.mockImplementationOnce(() => Promise.reject(new Error('blocked')));
      show(frame());

      await waitFor(() => expect(useFrameStore.getState().isMuted).toBe(true));
      expect(video().muted).toBe(true);
      expect(play.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('uses the stream when the frame has one', () => {
      show(
        frame({
          media: [
            {
              type: 'video',
              url: 'https://media.test/f1.mp4',
              standardUrl: 'https://media.test/f1.m3u8',
            },
          ],
        } as never),
      );

      expect(video()).toHaveAttribute('data-hls', 'https://media.test/f1.m3u8');
    });

    it('switches the sound from its button and from the M key', () => {
      show(frame());

      fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
      expect(useFrameStore.getState().isMuted).toBe(false);
      expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'm' });
      expect(useFrameStore.getState().isMuted).toBe(true);
    });

    it('pauses and resumes with the space bar', () => {
      show(frame());

      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      expect(video().paused).toBe(true);

      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      expect(video().paused).toBe(false);
    });

    it('leaves the keys alone while someone is typing', () => {
      show(frame());
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();

      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      fireEvent.keyDown(window, { key: 'm' });

      expect(video().paused).toBe(false);
      expect(useFrameStore.getState().isMuted).toBe(true);
      field.remove();
    });

    it('ignores the keys of a frame that is not on screen', () => {
      show(frame(), { isActive: false });

      fireEvent.keyDown(window, { key: 'm' });

      expect(useFrameStore.getState().isMuted).toBe(true);
    });

    it('moves the video when the progress bar is dragged', () => {
      show(frame());
      Object.defineProperty(video(), 'duration', {
        configurable: true,
        value: 20,
      });
      fireEvent.loadedMetadata(video());

      fireEvent.change(screen.getByRole('slider', { name: 'Video progress' }), {
        target: { value: '50' },
      });

      expect(video().currentTime).toBe(10);
    });
  });

  describe('taps', () => {
    const area = () =>
      screen.getByRole('button', { name: 'Video playback area' });

    it('pauses on one tap, and plays again on the next', () => {
      vi.useFakeTimers();
      show(frame());

      fireEvent.click(area());
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(video().paused).toBe(true);

      fireEvent.click(area());
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(video().paused).toBe(false);
    });

    it('takes two quick taps as one gesture and keeps playing', () => {
      vi.useFakeTimers();
      show(frame());

      fireEvent.click(area());
      fireEvent.click(area());
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(video().paused).toBe(false);
      expect(pause).not.toHaveBeenCalled();
    });

    it('still takes them as one gesture when the video advances in between', () => {
      vi.useFakeTimers();
      show(frame());

      fireEvent.click(area());
      // Players report their position several times a second, and each
      // report redraws the frame.
      reportTime(4);
      fireEvent.click(area());
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(video().paused).toBe(false);
      expect(pause).not.toHaveBeenCalled();
    });
  });

  describe('two taps', () => {
    const area = () =>
      screen.getByRole('button', { name: 'Video playback area' });
    const twoTaps = () => {
      fireEvent.click(area());
      fireEvent.click(area());
    };
    const liked = (queryClient: {
      getQueryData: (key: unknown[]) => unknown;
    }) =>
      (queryClient.getQueryData(['like', 'f1']) as { data: { liked: boolean } })
        ?.data.liked;

    it('like the frame: the count goes up and the like control turns on', async () => {
      const { queryClient } = show(frame());

      twoTaps();

      await waitFor(() => expect(likesApi.toggle).toHaveBeenCalledWith('f1'));
      expect(likesApi.toggle).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('likes')).toHaveTextContent('4');
      expect(liked(queryClient)).toBe(true);
    });

    it('never take a like away', async () => {
      vi.mocked(likesApi.check).mockResolvedValue({
        data: { liked: true },
      } as never);
      show(frame());

      twoTaps();

      await waitFor(() => expect(likesApi.check).toHaveBeenCalled());
      await act(async () => {});
      expect(likesApi.toggle).not.toHaveBeenCalled();
      expect(screen.getByTestId('likes')).toHaveTextContent('3');
    });

    it('give one like, however many times they are repeated', async () => {
      const { queryClient } = show(frame());

      twoTaps();
      await waitFor(() => expect(liked(queryClient)).toBe(true));
      twoTaps();
      await act(async () => {});

      expect(likesApi.toggle).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('likes')).toHaveTextContent('4');
    });

    it('put the like back when it was there and the screen did not know', async () => {
      vi.mocked(likesApi.toggle)
        .mockResolvedValueOnce({ data: { liked: false } } as never)
        .mockResolvedValueOnce({ data: { liked: true } } as never);
      show(frame());

      twoTaps();

      await waitFor(() => expect(likesApi.toggle).toHaveBeenCalledTimes(2));
    });

    it('undo the like on screen when it cannot be saved', async () => {
      vi.mocked(likesApi.toggle).mockRejectedValue(new Error('offline'));
      show(frame());

      twoTaps();

      await waitFor(() => expect(likesApi.toggle).toHaveBeenCalled());
      await waitFor(() =>
        expect(screen.getByTestId('likes')).toHaveTextContent('3'),
      );
    });
  });

  describe('what the creator learns', () => {
    it('reports the time watched when the viewer moves on', () => {
      vi.useFakeTimers();
      const { rerender } = show(frame());

      for (let second = 1; second <= 3; second++) {
        vi.advanceTimersByTime(1000);
        reportTime(second);
      }
      rerender(<FrameItem post={frame()} isActive={false} />);

      expect(creatorApi.trackFrameWatch).toHaveBeenCalledTimes(1);
      expect(creatorApi.trackFrameWatch).toHaveBeenCalledWith('f1', 3);
    });

    it('does not report a glance of under a second', () => {
      vi.useFakeTimers();
      const { rerender } = show(frame());

      vi.advanceTimersByTime(500);
      reportTime(0.5);
      rerender(<FrameItem post={frame()} isActive={false} />);

      expect(creatorApi.trackFrameWatch).not.toHaveBeenCalled();
    });

    it('reports every ten seconds watched while it keeps playing', () => {
      vi.useFakeTimers();
      show(frame());

      for (let second = 1; second <= 10; second++) {
        vi.advanceTimersByTime(1000);
        reportTime(second);
      }

      expect(creatorApi.trackFrameWatch).toHaveBeenCalledTimes(1);
      expect(creatorApi.trackFrameWatch).toHaveBeenCalledWith('f1', 10);
    });

    it('does not count the time the video sat paused', () => {
      vi.useFakeTimers();
      const { rerender } = show(frame());

      vi.advanceTimersByTime(1500);
      reportTime(1.5);
      vi.advanceTimersByTime(60_000);
      reportTime(1.6);
      rerender(<FrameItem post={frame()} isActive={false} />);

      expect(creatorApi.trackFrameWatch).toHaveBeenCalledWith('f1', 1.5);
    });

    it('counts a replay when the video starts over', () => {
      show(frame());

      reportTime(19);
      reportTime(0.2);

      expect(creatorApi.trackFrameLoop).toHaveBeenCalledTimes(1);
      expect(creatorApi.trackFrameLoop).toHaveBeenCalledWith('f1');
    });

    it('does not count a short step back as a replay', () => {
      show(frame());

      reportTime(10);
      reportTime(9.5);

      expect(creatorApi.trackFrameLoop).not.toHaveBeenCalled();
    });

    it('counts a promoted frame as seen once, when half of it is visible', () => {
      vi.mocked(creatorApi.recordPromotionView).mockResolvedValue({} as never);
      show(frame({ isPromoted: true, promotionId: 'promo-1' } as never));
      const seen = (isIntersecting: boolean) =>
        observers[0].callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );

      seen(false);
      expect(creatorApi.recordPromotionView).not.toHaveBeenCalled();

      seen(true);
      seen(true);
      expect(creatorApi.recordPromotionView).toHaveBeenCalledTimes(1);
      expect(creatorApi.recordPromotionView).toHaveBeenCalledWith('promo-1');
    });

    it('does not watch a frame that is not promoted', () => {
      show(frame());

      expect(observers).toHaveLength(0);
    });
  });

  describe('a paid frame', () => {
    const locked = () => frame({ isLocked: true, priceCents: 499 } as never);

    it('shows the price in whole currency', () => {
      show(locked());

      expect(screen.getByText('unlock for 4.99')).toBeInTheDocument();
    });

    it('keeps the unlock outside the playback button', () => {
      show(locked());

      expect(
        screen
          .getByRole('button', { name: 'Video playback area' })
          .contains(screen.getByText('unlock for 4.99')),
      ).toBe(false);
    });

    it('refreshes the lists when it unlocks without a payment page', async () => {
      vi.mocked(monetizationApi.unlockPost).mockResolvedValue({} as never);
      const { queryClient } = show(locked());
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

      act(() => paywall.unlock());

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Post successfully unlocked!',
        ),
      );
      expect(monetizationApi.unlockPost).toHaveBeenCalledWith(
        'f1',
        window.location.href,
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['frames'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feed'] });
    });
  });

  describe('actions', () => {
    it('shows whether the viewer saved it', async () => {
      vi.mocked(bookmarksApi.check).mockResolvedValue({
        data: { bookmarked: true },
      } as never);
      show(frame());

      await waitFor(() =>
        expect(screen.getByTestId('saved')).toHaveTextContent('true'),
      );
      expect(bookmarksApi.check).toHaveBeenCalledWith('f1');
    });

    it('moves the like count with the viewer', () => {
      show(frame());

      fireEvent.click(screen.getByRole('button', { name: 'like' }));
      expect(screen.getByTestId('likes')).toHaveTextContent('4');

      fireEvent.click(screen.getByRole('button', { name: 'unlike' }));
      expect(screen.getByTestId('likes')).toHaveTextContent('3');
    });

    it('tells the page which panel to open', () => {
      const onCommentsOpen = vi.fn();
      const onShareOpen = vi.fn();
      const onSaveOpen = vi.fn();
      const onMenuOpen = vi.fn();
      show(frame(), { onCommentsOpen, onShareOpen, onSaveOpen, onMenuOpen });

      fireEvent.click(screen.getByRole('button', { name: 'comments' }));
      fireEvent.click(screen.getByRole('button', { name: 'share' }));
      fireEvent.click(screen.getByRole('button', { name: 'save' }));
      fireEvent.click(screen.getByRole('button', { name: 'menu' }));

      expect(onCommentsOpen).toHaveBeenCalledTimes(1);
      expect(onShareOpen).toHaveBeenCalledTimes(1);
      expect(onSaveOpen).toHaveBeenCalledTimes(1);
      expect(onMenuOpen).toHaveBeenCalledTimes(1);
    });

    it('follows the author and refreshes the frames', async () => {
      vi.mocked(followsApi.toggle).mockResolvedValue({} as never);
      const { queryClient } = show(frame());
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

      fireEvent.click(screen.getByRole('button', { name: 'follow' }));

      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['frames'] }),
      );
      expect(followsApi.toggle).toHaveBeenCalledWith('ana');
    });
  });

  describe('the menu of the frame on screen', () => {
    function withMenu(
      post: Post,
      props: Partial<Parameters<typeof FrameItem>[0]> = {},
    ) {
      const onRegisterMenuActions = vi.fn();
      const view = show(post, { onRegisterMenuActions, ...props });
      const actions = () =>
        onRegisterMenuActions.mock.calls.at(-1)?.[0] as FrameMenuActions | null;
      return { onRegisterMenuActions, actions, ...view };
    }

    it('is handed over once and taken back when the frame leaves', () => {
      const { onRegisterMenuActions, actions, rerender } = withMenu(frame());
      expect(onRegisterMenuActions).toHaveBeenCalledTimes(1);

      // A new save handler alone must not hand the menu over again.
      rerender(
        <FrameItem
          post={frame()}
          isActive
          onRegisterMenuActions={onRegisterMenuActions}
          onSaveOpen={vi.fn()}
        />,
      );
      expect(onRegisterMenuActions).toHaveBeenCalledTimes(1);

      rerender(
        <FrameItem
          post={frame()}
          isActive={false}
          onRegisterMenuActions={onRegisterMenuActions}
        />,
      );
      expect(actions()).toBeNull();
    });

    it('saves through the latest handler of the page', () => {
      const first = vi.fn();
      const latest = vi.fn();
      const { onRegisterMenuActions, actions, rerender } = withMenu(frame(), {
        onSaveOpen: first,
      });
      rerender(
        <FrameItem
          post={frame()}
          isActive
          onRegisterMenuActions={onRegisterMenuActions}
          onSaveOpen={latest}
        />,
      );

      actions()?.onSave();

      expect(latest).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
    });

    it('opens the report of that frame', () => {
      const { actions } = withMenu(frame());

      act(() => actions()?.onReport());

      expect(screen.getByTestId('report')).toHaveTextContent('f1');
    });

    it('deletes only after the question is confirmed', async () => {
      vi.mocked(postsApi.delete).mockResolvedValue({} as never);
      const { actions, queryClient } = withMenu(frame({ profileId: 'me' }));
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

      act(() => actions()?.onDelete());
      expect(await screen.findByText('Delete Frame')).toBeInTheDocument();
      expect(postsApi.delete).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(postsApi.delete).toHaveBeenCalledWith('f1'));
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['frames'] }),
      );
    });

    it('edits the caption, starting from the one the frame has', async () => {
      vi.mocked(postsApi.update).mockResolvedValue({} as never);
      const { actions, queryClient } = withMenu(
        frame({ profileId: 'me', caption: 'First take' }),
      );
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

      act(() => actions()?.onEdit());
      const field = await screen.findByPlaceholderText('Write a caption...');
      expect(field).toHaveValue('First take');
      expect(field).toHaveAttribute('maxlength', '2200');

      fireEvent.change(field, { target: { value: 'Second take' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(postsApi.update).toHaveBeenCalledWith('f1', 'Second take'),
      );
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['frames'] }),
      );
      await waitFor(() =>
        expect(
          screen.queryByPlaceholderText('Write a caption...'),
        ).not.toBeInTheDocument(),
      );
    });

    it('changes nothing when the caption is cancelled', async () => {
      const { actions } = withMenu(frame({ profileId: 'me', caption: 'Kept' }));

      act(() => actions()?.onEdit());
      const field = await screen.findByPlaceholderText('Write a caption...');
      fireEvent.change(field, { target: { value: 'Dropped' } });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      act(() => actions()?.onEdit());

      expect(postsApi.update).not.toHaveBeenCalled();
      expect(
        await screen.findByPlaceholderText('Write a caption...'),
      ).toHaveValue('Kept');
    });

    it('says so and keeps the text when the caption cannot be saved', async () => {
      vi.mocked(postsApi.update).mockRejectedValue(new Error('down'));
      const { actions } = withMenu(frame({ profileId: 'me', caption: 'Old' }));

      act(() => actions()?.onEdit());
      const field = await screen.findByPlaceholderText('Write a caption...');
      fireEvent.change(field, { target: { value: 'New' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Could not save the caption. Try again.',
        ),
      );
      expect(screen.getByPlaceholderText('Write a caption...')).toHaveValue(
        'New',
      );
    });

    it('offers promoting to creator and business accounts only', async () => {
      expect(withMenu(frame()).actions()?.onPromote).toBeUndefined();

      session.profile = { id: 'me', accountType: 'CREATOR' };
      const { actions } = withMenu(frame({ id: 'f2', profileId: 'me' }));
      act(() => actions()?.onPromote?.());

      expect(await screen.findByTestId('promote')).toHaveTextContent('f2');
    });
  });
});
