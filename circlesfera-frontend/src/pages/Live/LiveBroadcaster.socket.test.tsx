import {
  act,
  configure,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { liveApi } from '../../services/live';
import { renderWithProviders } from '../../test/test-utils';
import LiveBroadcaster from './LiveBroadcaster';

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
vi.mock('../../components/live/CinematicStage', () => ({
  default: () => null,
}));
vi.mock('../../components/live/LiveGoalBar', () => ({
  default: ({
    goal,
    onClick,
  }: {
    goal: { title: string; current: number; target: number } | null;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {goal
        ? `goal: ${goal.title} ${goal.current}/${goal.target}`
        : 'set a goal'}
    </button>
  ),
}));
vi.mock('../../components/live/LiveGoalDialog', () => ({
  default: ({
    isOpen,
    onSave,
    onClose,
  }: {
    isOpen: boolean;
    onSave: (goal: { title: string; target: number }) => void;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="goal">
        <button
          type="button"
          onClick={() => onSave({ title: 'New lens', target: 5000 })}
        >
          save goal
        </button>
        <button type="button" onClick={onClose}>
          close goal
        </button>
      </div>
    ) : null,
}));
vi.mock('../../components/live/LivePinnedComment', () => ({
  default: ({
    pinnedComment,
    onUnpin,
  }: {
    pinnedComment: { message: string } | null;
    onUnpin?: () => void;
  }) =>
    pinnedComment ? (
      <div>
        <span>pinned: {pinnedComment.message}</span>
        <button type="button" onClick={onUnpin}>
          unpin
        </button>
      </div>
    ) : null,
}));
vi.mock('../../components/live/LiveQnAPanel', () => ({
  default: ({
    isOpen,
    onClose,
    questions,
    onHighlightQuestion,
    onClearHighlight,
  }: {
    isOpen: boolean;
    onClose: () => void;
    questions: { id: string; question: string }[];
    onHighlightQuestion: (q: unknown) => void;
    onClearHighlight: () => void;
  }) =>
    isOpen ? (
      <div role="dialog" aria-label="questions">
        {questions.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onHighlightQuestion(q)}
          >
            project {q.question}
          </button>
        ))}
        <button type="button" onClick={onClearHighlight}>
          clear projected
        </button>
        <button type="button" onClick={onClose}>
          close questions
        </button>
      </div>
    ) : null,
}));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('../../services/api', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('../../stores/socketStore', () => ({
  useSocketStore: {
    getState: () => ({ socket: live.hasSocket ? live.socket : null }),
  },
}));
vi.mock('../../services/live', () => ({
  liveApi: { inviteCoHost: vi.fn(), removeCoHost: vi.fn() },
}));
vi.mock('../../services/profile.service', () => ({
  profileApi: {
    getProfile: vi.fn().mockResolvedValue({ data: { user: { id: 'u2' } } }),
  },
}));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => live.navigate,
}));

const fire = (name: string, data?: unknown) =>
  act(() => (live.handlers.get(name) as Handler)(data));
const ended = () =>
  vi.mocked(apiClient.post).mock.calls.filter(([url]) => url === '/live/end');

/** Fills the title, starts the live and waits for the live screen. */
async function goLive(title = '') {
  vi.mocked(apiClient.post).mockImplementation((url: string) =>
    Promise.resolve(
      url === '/live/start'
        ? { data: { token: 'lk-token', stream: { id: 'stream-1' } } }
        : { data: {} },
    ),
  );
  const view = renderWithProviders(<LiveBroadcaster />);
  if (title) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Stream title' }), {
      target: { value: title },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Start streaming' }));
  await screen.findByRole('button', { name: 'End livestream' });
  // The screen is drawn a moment before it starts listening to the room.
  if (live.hasSocket) await waitFor(() => expect(live.handlers.size).toBe(11));
  return view;
}

async function endLive() {
  fireEvent.click(screen.getByRole('button', { name: 'End livestream' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'End livestream' }),
  );
  await screen.findByText('Livestream ended');
}

const comment = () =>
  screen.getByRole('textbox', { name: 'Write a comment...' });
const say = (id: string, username: string, message: string) =>
  fire('live:chat_message', {
    id,
    user: { username, avatar: `${username}.jpg` },
    message,
  });

describe('LiveBroadcaster on the live connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    live.handlers.clear();
    live.hasSocket = true;
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it('starts with the title typed, or the default one, on camera and microphone', async () => {
    const first = await goLive('  Sunset set  ');
    expect(apiClient.post).toHaveBeenCalledWith('/live/start', {
      title: 'Sunset set',
    });
    expect(live.room).toMatchObject({
      token: 'lk-token',
      video: true,
      audio: true,
    });
    expect(live.socket.emit).toHaveBeenCalledWith('live:join', {
      streamId: 'stream-1',
    });
    first.unmount();

    vi.clearAllMocks();
    await goLive();
    expect(apiClient.post).toHaveBeenCalledWith('/live/start', {
      title: 'My Live Stream',
    });
  });

  it('leaves the set-up screen from its close button', () => {
    renderWithProviders(<LiveBroadcaster />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(live.navigate).toHaveBeenCalledWith(-1);
  });

  it('counts the people watching without the host', async () => {
    await goLive();

    fire('live:viewer_count_update', { viewerCount: 41 });
    expect(screen.getByText('40')).toBeInTheDocument();

    fire('live:viewer_count_update', { viewerCount: 0 });
    expect(screen.getByText('0')).toBeInTheDocument();

    fire('live:viewer_count_update', {});
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  describe('reactions of the people watching', () => {
    it('floats each one for two seconds, whichever way it arrives', async () => {
      const { container } = await goLive();
      // From here on: the two seconds a reaction floats are stepped by hand.
      vi.useFakeTimers();
      const floating = () => container.querySelectorAll('.animate-float-up');

      fire('live:reaction_received', { reaction: '❤️' });
      fire('live:reaction_received', { reaction: '🚀' });
      fire('live:reaction_received', {});
      fire('live:heart_received', undefined);

      expect(floating()).toHaveLength(4);
      expect([...floating()].map((el) => el.textContent)).toEqual([
        '',
        '🚀',
        '🔥',
        '',
      ]);
      expect(container.querySelectorAll('.animate-float-up svg')).toHaveLength(
        2,
      );

      act(() => vi.advanceTimersByTime(2000));
      expect(floating()).toHaveLength(0);
    });

    it('counts the hearts, and only the hearts, as likes in the summary', async () => {
      await goLive();
      fire('live:viewer_count_update', { viewerCount: 13 });
      fire('live:reaction_received', { reaction: '❤️' });
      fire('live:reaction_received', { reaction: '❤️' });
      fire('live:heart_received', { reaction: '❤️' });
      fire('live:reaction_received', { reaction: '👏' });

      await endLive();

      const figure = (label: string) =>
        screen.getByText(label).previousElementSibling?.textContent;
      expect(figure('Likes')).toBe('3');
      expect(figure('Viewers')).toBe('12');
    });
  });

  it('sends a heart on a double tap of the video, not of a control', async () => {
    await goLive();
    live.socket.emit.mockClear();

    fireEvent.doubleClick(
      screen.getByRole('button', { name: 'End livestream' }),
    );
    fireEvent.doubleClick(comment());
    expect(live.socket.emit).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByTestId('livekit-room'));
    expect(live.socket.emit).toHaveBeenCalledWith('live:heart', {
      streamId: 'stream-1',
    });
  });

  describe('the comments', () => {
    it('shows them as they arrive, keeps the last fifty and sends the host’s own', async () => {
      await goLive();
      say('m0', 'bob', 'first!');
      for (let i = 1; i <= 50; i++) say(`m${i}`, 'bob', `line ${i}`);
      expect(screen.queryByText('first!')).not.toBeInTheDocument();
      expect(screen.getByText('line 50')).toBeInTheDocument();

      expect(
        screen.getByRole('button', { name: 'Send comment' }),
      ).toBeDisabled();
      fireEvent.change(comment(), { target: { value: 'welcome' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send comment' }));

      expect(live.socket.emit).toHaveBeenCalledWith('live:chat', {
        streamId: 'stream-1',
        message: 'welcome',
      });
      expect(comment()).toHaveValue('');
    });

    it('does not send an empty comment', async () => {
      await goLive();
      live.socket.emit.mockClear();

      fireEvent.change(comment(), { target: { value: '  ' } });
      fireEvent.submit(comment());

      expect(live.socket.emit).not.toHaveBeenCalled();
    });

    it('pins the chosen comment for everyone and unpins it', async () => {
      await goLive();
      say('m1', 'bob', 'Great light');

      fireEvent.click(screen.getByRole('button', { name: /Great light/ }));
      expect(
        screen.getByRole('button', { name: /Great light/ }),
      ).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Pin' }));

      expect(live.socket.emit).toHaveBeenCalledWith('live:pin_comment', {
        streamId: 'stream-1',
        commentId: 'm1',
        message: 'Great light',
        username: 'bob',
        avatar: 'bob.jpg',
      });
      expect(
        screen.queryByRole('button', { name: 'Pin' }),
      ).not.toBeInTheDocument();

      fire('live:comment_pinned', { message: 'Great light' });
      fireEvent.click(screen.getByRole('button', { name: 'unpin' }));
      expect(live.socket.emit).toHaveBeenCalledWith('live:unpin_comment', {
        streamId: 'stream-1',
      });

      fire('live:comment_unpinned');
      expect(screen.queryByText(/pinned:/)).not.toBeInTheDocument();
    });

    it('takes a comment off the host’s screen, and closes its options without doing anything', async () => {
      await goLive();
      say('m1', 'bob', 'Keep me');
      say('m2', 'eve', 'Remove me');

      fireEvent.click(screen.getByRole('button', { name: /Keep me/ }));
      fireEvent.click(screen.getByRole('button', { name: /Keep me/ }));
      expect(
        screen.queryByRole('button', { name: 'Delete' }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Remove me/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(screen.queryByText('Remove me')).not.toBeInTheDocument();
      expect(screen.getByText('Keep me')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Keep me/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(
        screen.queryByRole('button', { name: 'Pin' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Keep me')).toBeInTheDocument();
    });
  });

  describe('the goal', () => {
    it('sets it for everyone, shows it and adds each gift to it', async () => {
      await goLive();

      fireEvent.click(screen.getByRole('button', { name: 'set a goal' }));
      fireEvent.click(screen.getByRole('button', { name: 'save goal' }));
      expect(live.socket.emit).toHaveBeenCalledWith('live:set_goal', {
        streamId: 'stream-1',
        title: 'New lens',
        target: 5000,
      });
      expect(
        screen.queryByRole('dialog', { name: 'goal' }),
      ).not.toBeInTheDocument();

      fire('live:goal_set', { title: 'New lens', current: 0, target: 5000 });
      fire('live:gift', { amountCents: 500 });
      fire('live:gift', { amountCents: 250 });
      fire('live:gift', {});
      expect(screen.getByText('goal: New lens 750/5000')).toBeInTheDocument();
    });

    it('ignores a gift while there is no goal, and can close the dialog', async () => {
      await goLive();

      fire('live:gift', { amountCents: 500 });
      expect(
        screen.getByRole('button', { name: 'set a goal' }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'set a goal' }));
      fireEvent.click(screen.getByRole('button', { name: 'close goal' }));
      expect(
        screen.queryByRole('dialog', { name: 'goal' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('questions', () => {
    it('counts them on the button, projects the chosen one and clears it', async () => {
      await goLive();
      fire('live:question_asked', {
        id: 'q1',
        question: 'What camera?',
        username: 'carol',
      });
      fire('live:question_asked', {
        id: 'q2',
        question: 'Where next?',
        username: 'dan',
        avatar: 'dan.jpg',
      });

      fireEvent.click(
        screen.getByRole('button', { name: '2 questions, open Q&A' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'project Where next?' }),
      );

      expect(live.socket.emit).toHaveBeenCalledWith('live:highlight_question', {
        streamId: 'stream-1',
        questionId: 'q2',
        question: 'Where next?',
        username: 'dan',
        avatar: 'dan.jpg',
      });
      expect(
        screen.queryByRole('dialog', { name: 'questions' }),
      ).not.toBeInTheDocument();

      fire('live:question_highlighted', {
        id: 'q2',
        question: 'Where next?',
        username: 'dan',
      });
      expect(screen.getByText('Where next?')).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: '2 questions, open Q&A' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'clear projected' }));
      expect(live.socket.emit).toHaveBeenCalledWith('live:clear_question', {
        streamId: 'stream-1',
      });

      fire('live:question_cleared');
      expect(screen.queryByText('Where next?')).not.toBeInTheDocument();
    });

    it('opens the panel with no question yet and closes it', async () => {
      await goLive();
      fireEvent.click(screen.getByRole('button', { name: 'Q&A' }));
      fireEvent.click(screen.getByRole('button', { name: 'close questions' }));
      expect(
        screen.queryByRole('dialog', { name: 'questions' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('ending', () => {
    it('ends the live once, leaves the room and does not end it again on the way out', async () => {
      const { unmount } = await goLive();

      await endLive();
      expect(ended()).toHaveLength(1);
      expect(live.socket.emit).toHaveBeenCalledWith('live:leave', {
        streamId: 'stream-1',
      });

      // The video connection closes on purpose: no warning, no leaving.
      act(() => (live.room.onDisconnected as () => void)());
      expect(toast.error).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Close summary' }));
      expect(live.navigate).toHaveBeenCalledWith(-1);

      unmount();
      expect(ended()).toHaveLength(1);
    });

    it('ends the live when the host leaves the screen without ending it', async () => {
      const { unmount } = await goLive();

      unmount();

      expect(ended()).toHaveLength(1);
      expect(live.socket.off.mock.calls.map(([name]) => name)).toContain(
        'live:reaction_received',
      );
      expect(live.handlers.size).toBe(0);
    });

    it('warns and leaves when the video connection is lost while on air', async () => {
      await goLive();

      act(() => (live.room.onDisconnected as () => void)());

      expect(toast.error).toHaveBeenCalledWith(
        'The connection to the live was lost.',
      );
      expect(live.navigate).toHaveBeenCalledWith(-1);
    });
  });

  it('says so when the co-host could not be removed', async () => {
    vi.mocked(liveApi.inviteCoHost).mockResolvedValue({} as never);
    vi.mocked(liveApi.removeCoHost).mockRejectedValue(new Error('down'));
    await goLive();
    fireEvent.click(screen.getByRole('button', { name: 'Invite a co-host' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: '@cohost username' }),
      {
        target: { value: '@dan' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    const remove = await screen.findByRole('button', {
      name: 'Remove co-host',
    });

    fireEvent.click(remove);

    await act(async () => {});
    expect(toast.error).toHaveBeenCalledWith(
      'Could not remove the co-host. Try again.',
    );
    expect(
      screen.getByRole('button', { name: 'Remove co-host' }),
    ).toBeInTheDocument();
  });

  it('goes on air with no connection for the chat', async () => {
    live.hasSocket = false;
    await goLive();
    live.socket.emit.mockClear();

    fireEvent.change(comment(), { target: { value: 'hello' } });
    fireEvent.submit(comment());
    fireEvent.doubleClick(screen.getByTestId('livekit-room'));
    fireEvent.click(screen.getByRole('button', { name: 'set a goal' }));
    fireEvent.click(screen.getByRole('button', { name: 'save goal' }));

    expect(live.socket.emit).not.toHaveBeenCalled();
  });
});
