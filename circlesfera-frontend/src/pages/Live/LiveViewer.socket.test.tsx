import {
  act,
  configure,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import LiveViewer from './LiveViewer';

type Handler = (data?: unknown) => void;

// The live screen appears after a request; a loaded machine can take more
// than the default second to draw it.
configure({ asyncUtilTimeout: 5000 });

const live = vi.hoisted(() => {
  const handlers = new Map<string, (data?: unknown) => void>();
  return {
    handlers,
    socket: {
      on: vi.fn((name: string, run: (data?: unknown) => void) =>
        handlers.set(name, run),
      ),
      off: vi.fn((name: string) => handlers.delete(name)),
      emit: vi.fn(),
    },
    hasSocket: true,
    room: {} as Record<string, unknown>,
    navigate: vi.fn(),
  };
});

vi.mock('@livekit/components-styles', () => ({}));
vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: (props: { children?: React.ReactNode }) => {
    live.room = props as Record<string, unknown>;
    return <div data-testid="livekit-room">{props.children}</div>;
  },
  RoomAudioRenderer: () => null,
}));
vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);
vi.mock('../../components/live/CinematicStage', () => ({
  default: () => null,
}));
vi.mock('../../components/live/LiveGoalBar', () => ({
  default: ({ goal }: { goal: { title: string } | null }) =>
    goal ? <div>goal: {goal.title}</div> : null,
}));
vi.mock('../../components/live/LivePinnedComment', () => ({
  default: ({
    pinnedComment,
  }: {
    pinnedComment: { message: string } | null;
  }) => (pinnedComment ? <div>pinned: {pinnedComment.message}</div> : null),
}));
vi.mock('../../components/live/CoHostInviteBanner', () => ({
  default: ({
    invite,
    onAccepted,
    onDismiss,
  }: {
    invite: { streamId: string } | null;
    onAccepted: (token: string, streamId: string) => void;
    onDismiss: () => void;
  }) =>
    invite ? (
      <div>
        <span>invited to {invite.streamId}</span>
        <button
          type="button"
          onClick={() => onAccepted('cohost-token', 'stream-2')}
        >
          accept invite
        </button>
        <button type="button" onClick={onDismiss}>
          dismiss invite
        </button>
      </div>
    ) : null,
}));
vi.mock('../../components/live/LiveGiftModal', () => ({
  default: ({
    isOpen,
    onClose,
    streamId,
  }: {
    isOpen: boolean;
    onClose: () => void;
    streamId: string;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="gifts">
        <span>gifts for {streamId}</span>
        <button type="button" onClick={onClose}>
          close gifts
        </button>
      </div>
    ) : null,
}));
vi.mock('../../components/live/LiveQnAPanel', () => ({
  default: ({
    isOpen,
    onClose,
    questions,
    onAskQuestion,
  }: {
    isOpen: boolean;
    onClose: () => void;
    questions: { id: string; question: string }[];
    onAskQuestion: (question: string) => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="questions">
        {questions.map((q) => (
          <p key={q.id}>asked: {q.question}</p>
        ))}
        <button type="button" onClick={() => onAskQuestion('Where next?')}>
          ask
        </button>
        <button type="button" onClick={onClose}>
          close questions
        </button>
      </div>
    ) : null,
}));
vi.mock('../../services/api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../stores/socketStore', () => ({
  useSocketStore: {
    getState: () => ({ socket: live.hasSocket ? live.socket : null }),
  },
}));
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => live.navigate,
}));

const fire = (name: string, data?: unknown) =>
  act(() => (live.handlers.get(name) as Handler)(data));

async function watch(path = '/live/stream-1') {
  vi.mocked(apiClient.get).mockImplementation((url: string) =>
    Promise.resolve(
      String(url).includes('/live/join/')
        ? { data: { token: 'lk-token' } }
        : {
            data: {
              title: 'Night set',
              host: { profile: { username: 'alice' } },
            },
          },
    ),
  );
  const view = renderWithProviders(
    <Routes>
      <Route path="/live/:streamId" element={<LiveViewer />} />
    </Routes>,
    { routerProps: { initialEntries: [path], useTransitions: false } },
  );
  await screen.findByTestId('livekit-room');
  // The listeners are attached in the same step as the two requests.
  if (live.hasSocket) await waitFor(() => expect(live.handlers.size).toBe(12));
  return view;
}

const comment = () =>
  screen.getByRole('textbox', { name: 'Write a comment...' });

describe('LiveViewer on the live connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    live.handlers.clear();
    live.hasSocket = true;
    useAuthStore.setState({
      profile: { username: 'me', avatar: 'me.jpg' } as never,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('joins the live, watching without camera or microphone, and leaves it on the way out', async () => {
    const { unmount } = await watch();

    expect(apiClient.get).toHaveBeenCalledWith('/live/stream-1');
    expect(apiClient.get).toHaveBeenCalledWith('/live/join/stream-1');
    expect(live.socket.emit).toHaveBeenCalledWith('live:join', {
      streamId: 'stream-1',
    });
    expect(live.room).toMatchObject({
      token: 'lk-token',
      video: false,
      audio: false,
    });
    const listened = [...live.handlers.keys()];
    expect(listened).toHaveLength(12);

    unmount();

    expect(live.socket.emit).toHaveBeenCalledWith('live:leave', {
      streamId: 'stream-1',
    });
    expect(live.socket.off.mock.calls.map(([name]) => name).sort()).toEqual(
      listened.sort(),
    );
  });

  it('still shows the live with no connection for the chat', async () => {
    live.hasSocket = false;
    await watch();

    expect(live.socket.emit).not.toHaveBeenCalled();
    fireEvent.change(comment(), { target: { value: 'hello' } });
    fireEvent.submit(comment());
    fireEvent.click(screen.getByRole('button', { name: 'Send 🔥' }));
    expect(live.socket.emit).not.toHaveBeenCalled();
  });

  it('shows how many people are watching, ignoring a count that is not a number', async () => {
    await watch();
    expect(screen.getByText('1')).toBeInTheDocument();

    fire('live:viewer_count_update', { viewerCount: 328 });
    expect(screen.getByText('328')).toBeInTheDocument();

    fire('live:viewer_count_update', { viewerCount: 'many' });
    fire('live:viewer_count_update', undefined);
    expect(screen.getByText('328')).toBeInTheDocument();
  });

  it('shows the comments as they arrive and keeps the last fifty', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await watch();

    fire('live:chat_message', {
      id: 'm0',
      user: { username: 'bob' },
      message: 'first!',
    });
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('first!')).toBeInTheDocument();

    for (let i = 1; i <= 50; i++) {
      fire('live:chat_message', {
        id: `m${i}`,
        user: { username: 'bob' },
        message: `line ${i}`,
      });
    }
    expect(screen.queryByText('first!')).not.toBeInTheDocument();
    expect(screen.getByText('line 1')).toBeInTheDocument();
    expect(screen.getByText('line 50')).toBeInTheDocument();
  });

  it('shows the pinned comment, the goal and the invitation, and takes them away', async () => {
    await watch();

    fire('live:comment_pinned', { message: 'Read the rules' });
    expect(screen.getByText('pinned: Read the rules')).toBeInTheDocument();
    fire('live:comment_unpinned');
    expect(screen.queryByText(/pinned:/)).not.toBeInTheDocument();

    fire('live:goal_set', { title: 'New lens' });
    expect(screen.getByText('goal: New lens')).toBeInTheDocument();

    fire('live:cohost_invite', { streamId: 'stream-1', host: {} });
    fireEvent.click(screen.getByRole('button', { name: 'dismiss invite' }));
    expect(screen.queryByText(/invited to/)).not.toBeInTheDocument();
  });

  it('puts the question the host chose over the video, and takes it away', async () => {
    await watch();

    fire('live:question_highlighted', {
      id: 'q1',
      username: 'carol',
      question: 'What camera?',
    });
    expect(screen.getByText('What camera?')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'carol' })).toBeInTheDocument();

    fire('live:question_cleared');
    expect(screen.queryByText('What camera?')).not.toBeInTheDocument();
  });

  it('floats a reaction for two seconds for each gift, heart and reaction', async () => {
    const { container } = await watch();
    // From here on: the two seconds a reaction floats are stepped by hand.
    vi.useFakeTimers();
    const floating = () =>
      [...container.querySelectorAll('.text-3xl')].map((el) => el.textContent);

    fire('live:reaction_received', { reaction: '🚀' });
    fire('live:reaction_received', {});
    fire('live:heart_received', { reaction: '👏' });
    fire('live:heart_received', undefined);
    expect(floating()).toEqual(['🚀', '🔥', '👏', '']);
    expect(container.querySelectorAll('.text-3xl svg')).toHaveLength(1);

    act(() => vi.advanceTimersByTime(2000));
    expect(floating()).toEqual([]);
  });

  it('announces a gift, naming who sent it when it is known', async () => {
    await watch();

    fire('live:gift', { giftId: 'rose', senderUsername: 'dave' });
    expect(toast.success).toHaveBeenLastCalledWith(
      expect.stringContaining('dave'),
    );
    expect(toast.success).toHaveBeenLastCalledWith(
      expect.stringContaining('rose'),
    );

    fire('live:gift', {});
    expect(toast.success).toHaveBeenLastCalledWith(
      expect.stringContaining('Someone'),
    );
  });

  describe('taking part', () => {
    it('sends a comment and empties the field', async () => {
      await watch();

      fireEvent.change(comment(), { target: { value: 'hello there' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send comment' }));

      expect(live.socket.emit).toHaveBeenCalledWith('live:chat', {
        streamId: 'stream-1',
        message: 'hello there',
      });
      expect(comment()).toHaveValue('');
    });

    it('does not send an empty comment', async () => {
      await watch();
      live.socket.emit.mockClear();

      fireEvent.change(comment(), { target: { value: '   ' } });
      fireEvent.submit(comment());

      expect(live.socket.emit).not.toHaveBeenCalled();
    });

    it('sends the reaction that is pressed', async () => {
      await watch();

      fireEvent.click(screen.getByRole('button', { name: 'Send 🚀' }));

      expect(live.socket.emit).toHaveBeenCalledWith('live:send_reaction', {
        streamId: 'stream-1',
        reaction: '🚀',
      });
    });

    it('sends a heart on a double tap of the video', async () => {
      await watch();
      live.socket.emit.mockClear();

      fireEvent.doubleClick(screen.getByTestId('livekit-room'));

      expect(live.socket.emit).toHaveBeenCalledWith('live:send_reaction', {
        streamId: 'stream-1',
        reaction: '❤️',
      });
    });

    it.each([
      [
        'a reaction button',
        () => screen.getByRole('button', { name: 'Send 🔥' }),
      ],
      ['the comment field', () => comment()],
      ['the close button', () => screen.getByRole('button', { name: 'Close' })],
    ])('sends no heart on a double tap of %s', async (_what, control) => {
      await watch();
      live.socket.emit.mockClear();

      fireEvent.doubleClick(control());

      expect(live.socket.emit).not.toHaveBeenCalled();
    });

    it('opens the gifts and closes them', async () => {
      await watch();

      fireEvent.click(screen.getByRole('button', { name: 'Send gift' }));
      expect(screen.getByText('gifts for stream-1')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'close gifts' }));
      expect(
        screen.queryByRole('dialog', { name: 'gifts' }),
      ).not.toBeInTheDocument();
    });

    it('lists the questions asked and sends one with the name and picture of the person', async () => {
      await watch();
      fire('live:question_asked', { id: 'q1', question: 'Older one' });
      fire('live:question_asked', { id: 'q2', question: 'Newer one' });

      fireEvent.click(screen.getByRole('button', { name: 'Q&A' }));
      expect(
        screen.getAllByText(/^asked:/).map((el) => el.textContent),
      ).toEqual(['asked: Newer one', 'asked: Older one']);

      fireEvent.click(screen.getByRole('button', { name: 'ask' }));

      expect(live.socket.emit).toHaveBeenCalledWith('live:ask_question', {
        streamId: 'stream-1',
        question: 'Where next?',
        username: 'me',
        avatar: 'me.jpg',
      });
      expect(
        screen.queryByRole('dialog', { name: 'questions' }),
      ).not.toBeInTheDocument();
    });

    it('asks as anonymous for a person with no name, and can close the panel without asking', async () => {
      useAuthStore.setState({ profile: { username: '  ' } as never });
      await watch();

      fireEvent.click(screen.getByRole('button', { name: 'Q&A' }));
      fireEvent.click(screen.getByRole('button', { name: 'close questions' }));
      expect(
        screen.queryByRole('dialog', { name: 'questions' }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Q&A' }));
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      expect(live.socket.emit).toHaveBeenCalledWith(
        'live:ask_question',
        expect.objectContaining({ username: 'Viewer', avatar: undefined }),
      );
    });
  });

  it('goes on air with camera and microphone when an invitation to co-host is accepted', async () => {
    await watch();
    fire('live:cohost_invite', { streamId: 'stream-2', host: {} });

    fireEvent.click(screen.getByRole('button', { name: 'accept invite' }));

    expect(live.room).toMatchObject({
      token: 'cohost-token',
      video: true,
      audio: true,
    });
    expect(screen.queryByText(/invited to/)).not.toBeInTheDocument();

    fireEvent.change(comment(), { target: { value: 'hi' } });
    fireEvent.submit(comment());
    expect(live.socket.emit).toHaveBeenCalledWith('live:chat', {
      streamId: 'stream-2',
      message: 'hi',
    });
  });

  it('leaves from the close button', async () => {
    await watch();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(live.navigate).toHaveBeenCalledWith(-1);
  });

  it('says the connection was lost and leaves', async () => {
    await watch();

    act(() => (live.room.onDisconnected as () => void)());

    expect(toast.error).toHaveBeenCalledWith(expect.any(String));
    expect(live.navigate).toHaveBeenCalledWith(-1);
  });

  it('says a gift was cancelled on coming back from the payment page', async () => {
    await watch('/live/stream-1?gift_canceled=true');
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
