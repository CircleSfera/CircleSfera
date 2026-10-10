import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookmarksApi, creatorApi, postsApi } from '../services';
import { createTestQueryClient } from '../test/test-utils';
import type { Post } from '../types';
import { telemetry } from '../utils/telemetry';
import { usePostInteractions } from './usePostInteractions';

const session = vi.hoisted(() => ({
  profile: { id: 'me', accountType: 'PERSONAL' },
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: typeof session) => unknown) => selector(session),
}));
vi.mock('../services', () => ({
  bookmarksApi: { check: vi.fn(), toggle: vi.fn() },
  creatorApi: { recordPromotionView: vi.fn() },
  postsApi: { delete: vi.fn(), update: vi.fn() },
}));
vi.mock('../utils/telemetry', () => ({ telemetry: { track: vi.fn() } }));

const post = (over: Partial<Post> = {}): Post =>
  ({
    id: 'p1',
    profileId: 'author',
    caption: 'Hello',
    _count: { likes: 3, comments: 0 },
    ...over,
  }) as Post;

/** The browser says whether the post is on screen. */
let onScreen: (visible: boolean) => void;

function setup(current: Post = post()) {
  const client = createTestQueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => usePostInteractions(current), { wrapper });
  return { client, invalidate, on: () => hook.result.current, ...hook };
}

const tracked = () =>
  vi.mocked(telemetry.track).mock.calls.map(([event]) => event);

describe('usePostInteractions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.profile = { id: 'me', accountType: 'PERSONAL' };
    vi.mocked(bookmarksApi.check).mockResolvedValue({
      data: { bookmarked: false },
    } as never);
    vi.mocked(creatorApi.recordPromotionView).mockResolvedValue({} as never);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        constructor(callback: IntersectionObserverCallback) {
          onScreen = (visible) =>
            callback(
              [{ isIntersecting: visible } as IntersectionObserverEntry],
              {} as IntersectionObserver,
            );
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('who is looking', () => {
    it('knows the author of the post', () => {
      expect(setup(post({ profileId: 'me' })).on().isOwner).toBe(true);
      expect(setup().on().isOwner).toBe(false);
    });

    it('offers promoting to creator and business accounts, not to personal ones', () => {
      expect(setup().on().canPromote).toBe(false);

      session.profile = { id: 'me', accountType: 'BUSINESS' };
      expect(setup().on().canPromote).toBe(true);
    });
  });

  describe('what is measured while the post is on screen', () => {
    it('counts an impression each time it comes on screen', () => {
      setup();

      act(() => onScreen(true));

      expect(tracked()).toEqual([
        { eventType: 'IMPRESSION', targetId: 'p1', targetType: 'POST' },
      ]);
    });

    it('reports how long it was looked at, when it leaves the screen', () => {
      vi.useFakeTimers();
      setup();

      act(() => onScreen(true));
      vi.advanceTimersByTime(2000);
      act(() => onScreen(false));

      expect(tracked()[1]).toEqual({
        eventType: 'DWELL_TIME',
        targetId: 'p1',
        targetType: 'POST',
        dwellTime: 2000,
      });
    });

    it('does not report a glance of half a second or less', () => {
      vi.useFakeTimers();
      setup();

      act(() => onScreen(true));
      vi.advanceTimersByTime(500);
      act(() => onScreen(false));

      expect(tracked().map((event) => event.eventType)).toEqual(['IMPRESSION']);
    });

    it('reports the time also when the post goes away while on screen', () => {
      vi.useFakeTimers();
      const { unmount } = setup();

      act(() => onScreen(true));
      vi.advanceTimersByTime(3000);
      unmount();

      expect(tracked()[1]).toMatchObject({
        eventType: 'DWELL_TIME',
        dwellTime: 3000,
      });
    });

    it('reports nothing for a post that never came on screen', () => {
      const { unmount } = setup();

      act(() => onScreen(false));
      unmount();

      expect(telemetry.track).not.toHaveBeenCalled();
    });

    it('counts a promoted post as seen once, however often it comes back', () => {
      setup(post({ isPromoted: true, promotionId: 'promo-1' } as never));

      act(() => onScreen(true));
      act(() => onScreen(false));
      act(() => onScreen(true));

      expect(creatorApi.recordPromotionView).toHaveBeenCalledTimes(1);
      expect(creatorApi.recordPromotionView).toHaveBeenCalledWith('promo-1');
    });

    it('does not count a view for a post that is not promoted', () => {
      setup();

      act(() => onScreen(true));

      expect(creatorApi.recordPromotionView).not.toHaveBeenCalled();
    });
  });

  describe('saving', () => {
    it('shows whether the post is saved, and in which collection', async () => {
      vi.mocked(bookmarksApi.check).mockResolvedValue({
        data: { bookmarked: true, collectionId: 'c1' },
      } as never);
      const { on } = setup();

      await waitFor(() => expect(on().isBookmarked).toBe(true));
      expect(on().collectionId).toBe('c1');
      expect(bookmarksApi.check).toHaveBeenCalledWith('p1');
    });

    it('marks it saved at once, counts the save and refreshes the saved lists', async () => {
      // Held back, so the screen is seen before the server answers.
      let answer: (value: unknown) => void = () => {};
      vi.mocked(bookmarksApi.toggle).mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }) as never,
      );
      const { on, invalidate, client } = setup();
      await waitFor(() =>
        expect(client.getQueryData(['bookmark', 'p1'])).toBeDefined(),
      );

      act(() => on().handleToggleBookmark());

      await waitFor(() => expect(on().isBookmarked).toBe(true));
      expect(bookmarksApi.toggle).toHaveBeenCalledWith('p1');
      expect(tracked()).toContainEqual({
        eventType: 'SAVE',
        targetId: 'p1',
        targetType: 'POST',
      });
      await act(async () => answer({}));
      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bookmarks'] }),
      );
    });

    it('does not count a save when the post is taken out of saved', async () => {
      vi.mocked(bookmarksApi.check).mockResolvedValue({
        data: { bookmarked: true },
      } as never);
      vi.mocked(bookmarksApi.toggle).mockResolvedValue({} as never);
      const { on } = setup();
      await waitFor(() => expect(on().isBookmarked).toBe(true));

      act(() => on().handleToggleBookmark());

      await waitFor(() => expect(bookmarksApi.toggle).toHaveBeenCalled());
      expect(tracked().map((event) => event.eventType)).not.toContain('SAVE');
    });

    it('goes back to how it was when it cannot be saved', async () => {
      vi.mocked(bookmarksApi.toggle).mockRejectedValue(new Error('offline'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { on, client } = setup();
      await waitFor(() =>
        expect(client.getQueryData(['bookmark', 'p1'])).toBeDefined(),
      );

      act(() => on().handleToggleBookmark());

      await waitFor(() => expect(bookmarksApi.toggle).toHaveBeenCalled());
      await waitFor(() => expect(on().isBookmarked).toBe(false));
    });
  });

  describe('liking and sharing', () => {
    it('moves the count with the like and counts only the like', () => {
      const { on } = setup();

      act(() => on().handleLikeToggle(true));
      expect(on().likesCount).toBe(4);

      act(() => on().handleLikeToggle(false));
      expect(on().likesCount).toBe(3);
      expect(tracked()).toEqual([
        { eventType: 'LIKE', targetId: 'p1', targetType: 'POST' },
      ]);
    });

    it('opens the share dialog and counts the share', () => {
      const { on } = setup();

      act(() => on().handleShare());

      expect(on().showShareModal).toBe(true);
      expect(tracked()).toEqual([
        { eventType: 'SHARE', targetId: 'p1', targetType: 'POST' },
      ]);
    });
  });

  describe('the menu of the post', () => {
    it('closes on a press outside it, not on a press inside', () => {
      const { on } = setup();
      const menu = document.createElement('div');
      const inside = menu.appendChild(document.createElement('button'));
      const button = document.createElement('button');
      const elsewhere = document.createElement('p');
      document.body.append(menu, button, elsewhere);
      (on().menuRef as { current: HTMLDivElement }).current = menu;
      (on().menuButtonRef as { current: HTMLButtonElement }).current = button;
      act(() => on().setShowMenu(true));

      act(() => {
        inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });
      expect(on().showMenu).toBe(true);

      act(() => {
        elsewhere.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });
      expect(on().showMenu).toBe(false);
      menu.remove();
      button.remove();
      elsewhere.remove();
    });

    it('opens under its button, aligned to its right edge', () => {
      const { on } = setup();
      const button = document.createElement('button');
      button.getBoundingClientRect = () =>
        ({ bottom: 120, right: 300 }) as DOMRect;
      (on().menuButtonRef as { current: HTMLButtonElement }).current = button;
      vi.stubGlobal('innerWidth', 390);

      act(() => on().setShowMenu(true));

      expect(on().menuPosition).toEqual({ top: 128, right: 90 });
    });

    it('goes from the menu to the question about muting', () => {
      const { on } = setup();
      act(() => on().setShowMenu(true));

      act(() => on().handleMute());

      expect(on().showMenu).toBe(false);
      expect(on().showMuteModal).toBe(true);
    });

    it('opens the tip dialog', () => {
      const { on } = setup();

      act(() => on().handleTip());

      expect(on().showTipModal).toBe(true);
    });
  });

  describe('changing the caption', () => {
    it('starts from the caption the post has', () => {
      expect(setup().on().editCaption).toBe('Hello');
      expect(setup(post({ caption: undefined })).on().editCaption).toBe('');
    });

    it('saves it, closes the dialog and refreshes where the post shows', async () => {
      vi.mocked(postsApi.update).mockResolvedValue({} as never);
      const { on, invalidate } = setup();
      const submit = { preventDefault: vi.fn() } as unknown as FormEvent;
      act(() => {
        on().setShowEditModal(true);
        on().setEditCaption('Edited');
      });

      act(() => on().handleEdit(submit));

      expect(submit.preventDefault).toHaveBeenCalled();
      await waitFor(() => expect(on().showEditModal).toBe(false));
      expect(postsApi.update).toHaveBeenCalledWith('p1', 'Edited');
      for (const queryKey of [['feed'], ['posts'], ['post', 'p1']]) {
        expect(invalidate).toHaveBeenCalledWith({ queryKey });
      }
    });

    it('keeps the dialog open when it cannot be saved', async () => {
      vi.mocked(postsApi.update).mockRejectedValue(new Error('down'));
      const { on } = setup();
      act(() => on().setShowEditModal(true));

      act(() =>
        on().handleEdit({ preventDefault: vi.fn() } as unknown as FormEvent),
      );

      await waitFor(() => expect(on().updateMutation.isError).toBe(true));
      expect(on().showEditModal).toBe(true);
    });
  });

  describe('deleting', () => {
    it('removes the post from the screen and refreshes every list it was in', async () => {
      vi.mocked(postsApi.delete).mockResolvedValue({} as never);
      const { on, invalidate } = setup();
      act(() => on().setShowDeleteModal(true));

      act(() => on().deleteMutation.mutate());

      await waitFor(() => expect(on().isDeleted).toBe(true));
      expect(on().showDeleteModal).toBe(false);
      expect(postsApi.delete).toHaveBeenCalledWith('p1');
      for (const key of [
        'feed',
        'posts',
        'userPosts',
        'frames',
        'userFrames',
        'userTagged',
      ]) {
        expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
      }
    });

    it('keeps the post and the question when it cannot be deleted', async () => {
      vi.mocked(postsApi.delete).mockRejectedValue(new Error('down'));
      const { on } = setup();
      act(() => on().setShowDeleteModal(true));

      act(() => on().deleteMutation.mutate());

      await waitFor(() => expect(on().deleteMutation.isError).toBe(true));
      expect(on().isDeleted).toBe(false);
      expect(on().showDeleteModal).toBe(true);
    });
  });
});
