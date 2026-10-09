import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatApi, storiesApi } from '../services';
import { apiClient } from '../services/api';
import { monetizationApi } from '../services/monetization.service';
import { renderWithProviders } from '../test/test-utils';
import type { Story } from '../types';
import StoryViewer from './StoryViewer';

vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector: (s: { profile: { id: string } }) => unknown) =>
    selector({ profile: { id: 'me' } }),
}));

vi.mock('../services', () => ({
  storiesApi: {
    markViewed: vi.fn(),
    getReactions: vi.fn(),
    addReaction: vi.fn(),
    getViews: vi.fn(),
    delete: vi.fn(),
  },
  chatApi: { sendMessage: vi.fn() },
}));

vi.mock('../services/api', () => ({ apiClient: { get: vi.fn() } }));

vi.mock('../services/monetization.service', () => ({
  monetizationApi: { unlockStory: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('./common/HlsVideoPlayer', () => ({
  default: ({ src }: { src: string }) => (
    <div data-testid="story-video" data-src={src} />
  ),
}));
vi.mock('./common/BrandAmbientBackground', () => ({ default: () => null }));
vi.mock('./UserAvatar', () => ({ default: () => null }));
vi.mock('./VerificationBadge', () => ({ default: () => null }));
vi.mock('./interactive/PollWidget', () => ({
  PollWidget: ({ pollId }: { pollId: string }) => (
    <div data-testid="poll">{pollId}</div>
  ),
}));
vi.mock('./interactive/QnaWidget', () => ({
  QnaWidget: ({ qnaBoxId }: { qnaBoxId: string }) => (
    <div data-testid="qna">{qnaBoxId}</div>
  ),
}));
vi.mock('./monetization/PaywallOverlay', () => ({
  default: ({ price, onUnlock }: { price: number; onUnlock: () => void }) => (
    <button type="button" onClick={onUnlock}>
      unlock for {price}
    </button>
  ),
}));

function story(id: string, over: Partial<Story> = {}): Story {
  return {
    id,
    profileId: 'author',
    url: `https://media.test/${id}.jpg`,
    mediaType: 'image',
    createdAt: new Date().toISOString(),
    profile: { id: 'author', username: 'ana' },
    ...over,
  } as Story;
}

const reactionsOf = (rows: unknown[]) =>
  ({ data: { data: rows } }) as Awaited<
    ReturnType<typeof storiesApi.getReactions>
  >;

function show(stories: Story[], initialIndex = 0) {
  const onClose = vi.fn();
  const view = renderWithProviders(
    <StoryViewer
      stories={stories}
      initialIndex={initialIndex}
      onClose={onClose}
    />,
  );
  return { onClose, ...view };
}

/** A tap on the story, at a point of a 300 px wide stage. */
function tapAt(x: number) {
  const stage = document.querySelector<HTMLElement>(
    '[data-content-shell="playback"] .z-30',
  );
  if (!stage) throw new Error('no tap area');
  stage.getBoundingClientRect = () => ({ left: 0, width: 300 }) as DOMRect;
  fireEvent.pointerDown(stage, { clientX: x });
  fireEvent.pointerUp(stage, { clientX: x });
}

const position = () => screen.getByText(/^Story \d+ of \d+/).textContent;

describe('StoryViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storiesApi.markViewed).mockResolvedValue({} as never);
    vi.mocked(storiesApi.getReactions).mockResolvedValue(reactionsOf([]));
    vi.mocked(storiesApi.addReaction).mockResolvedValue({} as never);
    vi.mocked(storiesApi.delete).mockResolvedValue({} as never);
    vi.mocked(chatApi.sendMessage).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("someone else's story", () => {
    it('records the view and offers a reply and a like', async () => {
      show([story('s1')]);

      await waitFor(() =>
        expect(storiesApi.markViewed).toHaveBeenCalledWith('s1'),
      );
      expect(screen.getByText('ana')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Reply...')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Delete this story' }),
      ).not.toBeInTheDocument();
    });

    it('sends the reply as a message about that story', async () => {
      const user = userEvent.setup();
      show([story('s1')]);

      const send = screen.getByRole('button', { name: 'Send reply' });
      expect(send).toBeDisabled();

      await user.type(screen.getByPlaceholderText('Reply...'), 'Nice one');
      await user.click(send);

      expect(chatApi.sendMessage).toHaveBeenCalledWith({
        recipientId: 'author',
        content: 'Nice one',
        storyId: 's1',
      });
      expect(await screen.findByPlaceholderText('Sent!')).toHaveValue('');
    });

    it('does not send a reply made only of spaces', async () => {
      const user = userEvent.setup();
      show([story('s1')]);

      await user.type(screen.getByPlaceholderText('Reply...'), '   {Enter}');

      expect(chatApi.sendMessage).not.toHaveBeenCalled();
    });

    it('keeps the text when the reply cannot be sent', async () => {
      const user = userEvent.setup();
      vi.mocked(chatApi.sendMessage).mockRejectedValue(new Error('offline'));
      show([story('s1')]);

      await user.type(screen.getByPlaceholderText('Reply...'), 'Hello{Enter}');

      await waitFor(() => expect(chatApi.sendMessage).toHaveBeenCalled());
      expect(screen.getByPlaceholderText('Reply...')).toHaveValue('Hello');
    });

    it('adds a heart and reads the reactions again', async () => {
      const user = userEvent.setup();
      show([story('s1')]);
      await waitFor(() =>
        expect(storiesApi.getReactions).toHaveBeenCalledTimes(1),
      );
      vi.mocked(storiesApi.getReactions).mockResolvedValue(
        reactionsOf([{ reaction: '❤️', profileId: 'me' }]),
      );

      await user.click(screen.getByRole('button', { name: 'Like story' }));

      expect(storiesApi.addReaction).toHaveBeenCalledWith('s1', '❤️');
      await waitFor(() =>
        expect(storiesApi.getReactions).toHaveBeenCalledTimes(2),
      );
      await waitFor(() =>
        expect(
          screen
            .getByRole('button', { name: 'Like story' })
            .querySelector('svg'),
        ).toHaveClass('fill-red-500'),
      );
    });

    it('shows the question box to visitors and the poll to everyone', () => {
      show([story('s1', { poll: { id: 'p1' }, qnaBox: { id: 'q1' } })]);

      expect(screen.getByTestId('poll')).toHaveTextContent('p1');
      expect(screen.getByTestId('qna')).toHaveTextContent('q1');
    });
  });

  describe('my own story', () => {
    const mine = (over: Partial<Story> = {}) =>
      story('s1', { profileId: 'me', ...over });

    it('does not count my own view and shows who reacted', async () => {
      vi.mocked(storiesApi.getReactions).mockResolvedValue(
        reactionsOf([
          { reaction: '🔥', profileId: 'p2', profile: { username: 'luis' } },
        ]),
      );
      show([mine({ _count: { views: 7 } } as Partial<Story>)]);

      expect(await screen.findByText('luis')).toBeInTheDocument();
      expect(screen.getByText(/7\s+Views/)).toBeInTheDocument();
      expect(storiesApi.markViewed).not.toHaveBeenCalled();
      expect(screen.queryByPlaceholderText('Reply...')).not.toBeInTheDocument();
    });

    it('hides the question box from its author', () => {
      show([mine({ qnaBox: { id: 'q1' } })]);

      expect(screen.queryByTestId('qna')).not.toBeInTheDocument();
      expect(screen.getByText('Q&A')).toBeInTheDocument();
    });

    it('lists who saw it', async () => {
      const user = userEvent.setup();
      vi.mocked(storiesApi.getViews).mockResolvedValue({
        data: {
          data: [{ id: 'v1', profile: { id: 'v1', username: 'marta' } }],
        },
      } as never);
      show([mine()]);

      await user.click(screen.getByRole('button', { name: /Views/ }));

      expect(storiesApi.getViews).toHaveBeenCalledWith('s1');
      expect(apiClient.get).not.toHaveBeenCalled();
      expect(await screen.findByText('marta')).toBeInTheDocument();
    });

    it('also loads the answers when the story has a question box', async () => {
      const user = userEvent.setup();
      vi.mocked(storiesApi.getViews).mockResolvedValue({
        data: { data: [] },
      } as never);
      vi.mocked(apiClient.get).mockResolvedValue({
        data: {
          prompt: 'Ask me',
          answers: [
            {
              id: 'a1',
              answerText: 'Why?',
              createdAt: new Date().toISOString(),
              user: { id: 'u1', username: 'marta' },
            },
            {
              id: 'a2',
              answerText: 'How?',
              createdAt: new Date().toISOString(),
              user: { id: 'u2', username: 'luis' },
            },
          ],
        },
      } as never);
      show([mine({ qnaBox: { id: 'q1' } })]);

      await user.click(screen.getByRole('button', { name: /Views/ }));

      expect(apiClient.get).toHaveBeenCalledWith('interactive/qna/q1');
      expect(await screen.findByText(/Q&A · 2/)).toBeInTheDocument();
      expect(screen.getByText('Story activity')).toBeInTheDocument();
      expect(screen.getByText('Why?')).toBeInTheDocument();
    });

    it('deletes it after confirming, and closes', async () => {
      const user = userEvent.setup();
      const { onClose, queryClient } = show([mine()]);
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

      await user.click(
        screen.getByRole('button', { name: 'Delete this story' }),
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(storiesApi.delete).toHaveBeenCalledWith('s1');
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stories'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-stories'] });
    });

    it('keeps it when the question is cancelled', async () => {
      const user = userEvent.setup();
      const { onClose } = show([mine()]);

      await user.click(
        screen.getByRole('button', { name: 'Delete this story' }),
      );
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(storiesApi.delete).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('says so when it cannot be deleted, and stays open', async () => {
      const user = userEvent.setup();
      vi.mocked(storiesApi.delete).mockRejectedValue(new Error('nope'));
      const { onClose } = show([mine()]);

      await user.click(
        screen.getByRole('button', { name: 'Delete this story' }),
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Failed to delete story'),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('a paid story', () => {
    const locked = () =>
      story('s1', { isLocked: true, priceCents: 250, poll: { id: 'p1' } });

    it('shows the price in whole currency and hides the poll', () => {
      show([locked()]);

      expect(
        screen.getByRole('button', { name: 'unlock for 2.5' }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('poll')).not.toBeInTheDocument();
    });

    it('says it is unlocked when no payment page is needed', async () => {
      const user = userEvent.setup();
      vi.mocked(monetizationApi.unlockStory).mockResolvedValue({} as never);
      const { queryClient } = show([locked()]);
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

      await user.click(screen.getByRole('button', { name: /unlock for/ }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Story unlocked'),
      );
      expect(monetizationApi.unlockStory).toHaveBeenCalledWith(
        's1',
        window.location.href,
      );
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stories'] });
    });
  });

  describe('moving between stories', () => {
    const three = () => [story('s1'), story('s2'), story('s3')];

    it('goes forward on a tap on the right and back on the left edge', () => {
      show(three(), 1);
      expect(position()).toBe('Story 2 of 3 from ana');

      tapAt(250);
      expect(position()).toBe('Story 3 of 3 from ana');

      tapAt(20);
      expect(position()).toBe('Story 2 of 3 from ana');
    });

    it('closes after the last one', () => {
      const { onClose } = show(three(), 2);

      tapAt(250);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('stays on the first one on a tap on the left edge', () => {
      const { onClose } = show(three(), 0);

      tapAt(20);

      expect(position()).toBe('Story 1 of 3 from ana');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('treats a long press as a pause, not as a tap', () => {
      vi.useFakeTimers();
      show(three(), 0);
      const stage = document.querySelector<HTMLElement>(
        '[data-content-shell="playback"] .z-30',
      )!;

      fireEvent.pointerDown(stage, { clientX: 250 });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      fireEvent.pointerUp(stage, { clientX: 250 });

      expect(position()).toBe('Story 1 of 3 from ana');
    });

    it('ignores a swipe', () => {
      show(three(), 0);
      const stage = document.querySelector<HTMLElement>(
        '[data-content-shell="playback"] .z-30',
      )!;

      fireEvent.pointerDown(stage, { clientX: 250 });
      fireEvent.pointerUp(stage, { clientX: 120 });

      expect(position()).toBe('Story 1 of 3 from ana');
    });

    it('moves on by itself when the time of a photo runs out', () => {
      vi.useFakeTimers();
      show(three(), 0);

      act(() => {
        vi.advanceTimersByTime(5200);
      });

      expect(position()).toBe('Story 2 of 3 from ana');
    });

    it('waits while the delete question is open', async () => {
      vi.useFakeTimers();
      show([story('s1', { profileId: 'me' }), story('s2')], 0);

      fireEvent.click(
        screen.getByRole('button', { name: 'Delete this story' }),
      );
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      expect(position()).toBe('Story 1 of 2 from ana');
    });

    it('marks each story as seen when it comes up', async () => {
      show(three(), 0);
      await waitFor(() =>
        expect(storiesApi.markViewed).toHaveBeenCalledWith('s1'),
      );

      tapAt(250);

      await waitFor(() =>
        expect(storiesApi.markViewed).toHaveBeenCalledWith('s2'),
      );
    });
  });

  it('plays a video story in the player', () => {
    show([
      story('s1', { mediaType: 'video', url: 'https://media.test/s1.mp4' }),
    ]);

    const players = screen.getAllByTestId('story-video');
    expect(players.at(-1)).toHaveAttribute(
      'data-src',
      'https://media.test/s1.mp4',
    );
  });

  it('switches the sound and closes from the header', async () => {
    const user = userEvent.setup();
    const { onClose } = show([story('s1')]);

    await user.click(screen.getByRole('button', { name: 'Mute' }));
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Close story viewer' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once when there is nothing to show', () => {
    const { onClose } = show([]);

    expect(onClose).toHaveBeenCalled();
    expect(
      document.querySelector('[data-content-shell="playback"]'),
    ).toBeNull();
  });
});
