import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement, type ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, chatApi, uploadApi } from '../../services/index';
import { useAuthStore } from '../../stores/authStore';
import { renderWithProviders } from '../../test/test-utils';
import type { Message } from '../../types';
import { pickNativeImage } from '../../utils/nativeFilePicker';
import ChatWindow from './ChatWindow';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../services/index', () => ({
  apiClient: { post: vi.fn() },
  uploadApi: { upload: vi.fn() },
  chatApi: {
    getMessages: vi.fn(),
    getConversation: vi.fn(),
    markAsRead: vi.fn(),
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    deleteConversation: vi.fn(),
    updateGroup: vi.fn(),
    removeParticipant: vi.fn(),
    leaveGroup: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../utils/nativeFilePicker', () => ({
  pickNativeImage: vi.fn(),
}));

// Render every row: jsdom has no layout for the virtualizer to measure.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 80,
        key: index,
      })),
    getTotalSize: () => count * 80,
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));

/** jsdom cannot run the animations; render the elements without motion. */
vi.mock('framer-motion', () => {
  const pass =
    (tag: 'button' | 'div') =>
    ({
      children,
      animate: _animate,
      initial: _initial,
      exit: _exit,
      transition: _transition,
      ...props
    }: Record<string, unknown> & { children?: ReactNode }) =>
      createElement(tag, props, children);
  return {
    motion: { button: pass('button'), div: pass('div') },
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
  };
});

vi.mock('../UserAvatar', () => ({ default: () => null }));

// The bubble has its own tests; this one shows the message and exposes the
// actions the window handles.
vi.mock('./MessageBubble', () => ({
  default: ({
    msg,
    isMe,
    isRead,
    onReply,
    onReact,
    onEdit,
    onDelete,
    onUnlock,
  }: {
    msg: Message;
    isMe: boolean;
    isRead?: boolean;
    onReply: (msg: Message) => void;
    onReact: (id: string, emoji: string) => void;
    onEdit: (msg: Message, text: string) => void;
    onDelete: (id: string) => void;
    onUnlock: (id: string) => void;
  }) => (
    <div
      data-testid={`message-${msg.id}`}
      data-mine={isMe}
      data-read={isRead}
      data-locked-cents={msg.priceCents ?? ''}
    >
      <span>{msg.isDeleted ? 'deleted message' : msg.content}</span>
      <span data-testid={`reactions-${msg.id}`}>
        {(msg.reactions ?? [])
          .map((r) => `${r.profileId}:${r.reaction}`)
          .join(',')}
      </span>
      <button type="button" onClick={() => onReply(msg)}>
        reply {msg.id}
      </button>
      <button type="button" onClick={() => onReact(msg.id!, '🔥')}>
        react {msg.id}
      </button>
      <button type="button" onClick={() => onEdit(msg, msg.content)}>
        edit {msg.id}
      </button>
      <button type="button" onClick={() => onDelete(msg.id!)}>
        delete {msg.id}
      </button>
      <button type="button" onClick={() => onUnlock(msg.id!)}>
        unlock {msg.id}
      </button>
    </div>
  ),
}));

vi.mock('../audio/VoiceRecorder', () => ({
  VoiceRecorder: ({
    onSendVoice,
    onCancel,
  }: {
    onSendVoice: (data: {
      voiceUrl: string;
      voiceDuration: number;
      voiceWaveform: number[];
    }) => void;
    onCancel: () => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onSendVoice({
            voiceUrl: 'https://cdn.test/voice.webm',
            voiceDuration: 3,
            voiceWaveform: [1, 2],
          })
        }
      >
        send recorded voice
      </button>
      <button type="button" onClick={onCancel}>
        cancel recording
      </button>
    </div>
  ),
}));

vi.mock('./GroupDetailsModal', () => ({
  default: ({
    onClose,
    onUpdate,
    onRemoveParticipant,
    onLeaveGroup,
  }: {
    onClose: () => void;
    onUpdate: (data: { name?: string }) => void;
    onRemoveParticipant: (id: string) => void;
    onLeaveGroup: () => void;
  }) => (
    <div data-testid="group-details">
      <button type="button" onClick={() => onUpdate({ name: 'Renamed' })}>
        rename group
      </button>
      <button type="button" onClick={() => onRemoveParticipant('p3')}>
        remove member
      </button>
      <button type="button" onClick={onLeaveGroup}>
        leave group
      </button>
      <button type="button" onClick={onClose}>
        close details
      </button>
    </div>
  ),
}));

type Handler = (payload: unknown) => void;
const handlers = new Map<string, Handler>();
const socket = {
  on: (event: string, fn: Handler) => handlers.set(event, fn),
  off: (event: string) => handlers.delete(event),
  emit: vi.fn(),
};
const socketState = {
  socket: socket as typeof socket | null,
  typingUsers: {} as Record<string, string[]>,
  userStatuses: {} as Record<
    string,
    { isOnline: boolean; lastSeenAt?: string }
  >,
  startTyping: vi.fn(),
  stopTyping: vi.fn(),
  markRead: vi.fn(),
};
vi.mock('../../stores/socketStore', () => ({
  useSocketStore: () => socketState,
}));

const initiateCall = vi.fn();
vi.mock('../../stores/useCallStore', () => ({
  useCallStore: { getState: () => ({ initiateCall }) },
}));

const ME = { id: 'me', username: 'me', fullName: 'Me' };
const ANA = {
  id: 'p2',
  username: 'ana',
  fullName: 'Ana Ruiz',
  avatar: 'ana.jpg',
};

const directConversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: null,
  isGroup: false,
  participants: [
    { id: 'cp1', profileId: 'me', profile: ME, hasAccepted: true },
    { id: 'cp2', profileId: 'p2', profile: ANA, hasAccepted: true },
  ],
  ...overrides,
});

const groupConversation = () => ({
  id: 'c1',
  name: 'Trip',
  isGroup: true,
  participants: [
    { id: 'cp1', profileId: 'me', profile: ME, hasAccepted: true },
    { id: 'cp2', profileId: 'p2', profile: ANA, hasAccepted: true },
    {
      id: 'cp3',
      profileId: 'p3',
      profile: { id: 'p3', username: 'leo' },
      hasAccepted: true,
    },
  ],
});

const message = (id: string, senderId: string, content: string) => ({
  id,
  conversationId: 'c1',
  senderId,
  content,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  reactions: [],
});

const HISTORY = [message('m1', 'p2', 'hola'), message('m2', 'me', 'qué tal')];

function renderChat(entry = '/direct/t/c1') {
  return renderWithProviders(
    <Routes>
      <Route path="/direct/t/:id" element={<ChatWindow />} />
    </Routes>,
    { routerProps: { initialEntries: [entry] } },
  );
}

async function renderLoadedChat(entry?: string) {
  const view = renderChat(entry);
  await screen.findByText('hola');
  return view.i18n as I18nInstance;
}

function typeMessage(i18n: I18nInstance, text: string) {
  fireEvent.change(screen.getByPlaceholderText(i18n.t('chat.type_message')), {
    target: { value: text },
  });
}

function send(i18n: I18nInstance) {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('chat.send') }));
}

function emit(event: string, payload: unknown) {
  act(() => handlers.get(event)?.(payload));
}

describe('ChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    socketState.socket = socket;
    socketState.typingUsers = {};
    socketState.userStatuses = {};
    Element.prototype.scrollTo = vi.fn();
    useAuthStore.setState({ profile: ME as never });
    vi.mocked(chatApi.getMessages).mockResolvedValue({
      data: HISTORY,
    } as never);
    vi.mocked(chatApi.getConversation).mockResolvedValue({
      data: directConversation(),
    } as never);
    vi.mocked(chatApi.markAsRead).mockResolvedValue({} as never);
    vi.mocked(chatApi.sendMessage).mockImplementation(
      async (data) =>
        ({
          data: { ...message('sent-1', 'me', data.content), ...data },
        }) as never,
    );
    vi.mocked(pickNativeImage).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('opening a conversation', () => {
    it('shows the history, the other person and marks the conversation as read', async () => {
      const view = renderChat();

      expect(
        screen.getByText(view.i18n!.t('chat.loading_history')),
      ).toBeInTheDocument();
      expect(await screen.findByText('hola')).toBeInTheDocument();
      expect(screen.getByText('qué tal')).toBeInTheDocument();
      expect(screen.getByTestId('message-m1')).toHaveAttribute(
        'data-mine',
        'false',
      );
      expect(screen.getByTestId('message-m2')).toHaveAttribute(
        'data-mine',
        'true',
      );
      expect(await screen.findByText('Ana Ruiz')).toBeInTheDocument();
      expect(screen.getByText('@ana')).toBeInTheDocument();
      await waitFor(() =>
        expect(chatApi.markAsRead).toHaveBeenCalledWith('c1'),
      );
      expect(socketState.markRead).toHaveBeenCalledWith('c1', 'p2');
    });

    it('invites to say hello when there are no messages', async () => {
      vi.mocked(chatApi.getMessages).mockResolvedValue({ data: [] } as never);
      const { i18n } = renderChat();

      expect(
        await screen.findByText(i18n!.t('chat.say_hello')),
      ).toBeInTheDocument();
    });

    it('still opens when the history or the conversation cannot be loaded', async () => {
      vi.mocked(chatApi.getMessages).mockRejectedValue(new Error('down'));
      vi.mocked(chatApi.getConversation).mockRejectedValue(new Error('down'));
      const { i18n } = renderChat();

      expect(
        await screen.findByText(i18n!.t('chat.say_hello')),
      ).toBeInTheDocument();
      expect(chatApi.markAsRead).not.toHaveBeenCalled();
    });

    it('opens the details from the header, and the profile from the details', async () => {
      const i18n = await renderLoadedChat();

      fireEvent.click(await screen.findByText('Ana Ruiz'));

      // The conversation stays: the header no longer leaves for the profile.
      expect(mockNavigate).not.toHaveBeenCalled();
      const details = await screen.findByRole('dialog', {
        name: i18n.t('chat.details.title'),
      });

      fireEvent.click(
        within(details).getByRole('button', {
          name: i18n.t('chat.details.view_profile'),
        }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/ana');
    });

    it('marks my messages as read up to what the other person has read', async () => {
      vi.mocked(chatApi.getConversation).mockResolvedValue({
        data: directConversation({
          participants: [
            { id: 'cp1', profileId: 'me', profile: ME, hasAccepted: true },
            {
              id: 'cp2',
              profileId: 'p2',
              profile: ANA,
              hasAccepted: true,
              lastReadAt: '2026-09-30T00:00:00.000Z',
            },
          ],
        }),
      } as never);
      await renderLoadedChat();
      await screen.findByText('Ana Ruiz');

      expect(screen.getByTestId('message-m2')).toHaveAttribute(
        'data-read',
        'false',
      );

      emit('messages_read', {
        conversationId: 'c1',
        profileId: 'p2',
        readAt: '2026-10-02T00:00:00.000Z',
      });

      expect(screen.getByTestId('message-m2')).toHaveAttribute(
        'data-read',
        'true',
      );
    });
  });

  describe('presence', () => {
    it('says when the other person is online', async () => {
      socketState.userStatuses = { p2: { isOnline: true } };
      const i18n = await renderLoadedChat();

      expect(
        await screen.findByText(i18n.t('chat.active_now')),
      ).toBeInTheDocument();
    });

    it.each([
      [5 * 60_000, 'chat.active_mins_ago', { mins: 5 }],
      [3 * 3_600_000, 'chat.active_hours_ago', { hours: 3 }],
      [3 * 86_400_000, 'chat.active_recently', {}],
    ])(
      'says how long ago the other person was last seen (%i ms)',
      async (ago, key, values) => {
        socketState.userStatuses = {
          p2: {
            isOnline: false,
            lastSeenAt: new Date(Date.now() - ago - 1000).toISOString(),
          },
        };
        const i18n = await renderLoadedChat();

        expect(
          await screen.findByText(i18n.t(key, values)),
        ).toBeInTheDocument();
      },
    );

    it('shows that the other person is typing', async () => {
      socketState.typingUsers = { c1: ['p2', 'me'] };
      const i18n = await renderLoadedChat();

      expect(
        await screen.findByText(i18n.t('chat.typing')),
      ).toBeInTheDocument();
    });

    it('tells the other person while I type and when I stop', async () => {
      const i18n = await renderLoadedChat();
      await screen.findByText('Ana Ruiz');
      vi.useFakeTimers();

      typeMessage(i18n, 'h');
      typeMessage(i18n, 'ho');

      expect(socketState.startTyping).toHaveBeenCalledTimes(1);
      expect(socketState.startTyping).toHaveBeenCalledWith('c1', 'p2');
      expect(socketState.stopTyping).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(socketState.stopTyping).toHaveBeenCalledWith('c1', 'p2');
    });
  });

  describe('sending a text message', () => {
    it('shows the message at once, sends it and clears the box', async () => {
      const i18n = await renderLoadedChat();
      await screen.findByText('Ana Ruiz');

      typeMessage(i18n, 'nuevo mensaje');
      send(i18n);

      expect(screen.getByText('nuevo mensaje')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(i18n.t('chat.type_message')),
      ).toHaveValue('');
      await waitFor(() =>
        expect(chatApi.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            conversationId: 'c1',
            content: 'nuevo mensaje',
            tempId: expect.any(String),
          }),
        ),
      );
      expect(
        vi.mocked(chatApi.sendMessage).mock.calls[0][0],
      ).not.toHaveProperty('isLocked');
      expect(await screen.findByTestId('message-sent-1')).toBeInTheDocument();
      expect(screen.getAllByText('nuevo mensaje')).toHaveLength(1);
      expect(socketState.stopTyping).toHaveBeenCalledWith('c1', 'p2');
    });

    it('sends with Enter and keeps writing with Shift+Enter', async () => {
      const i18n = await renderLoadedChat();
      const box = screen.getByPlaceholderText(i18n.t('chat.type_message'));
      typeMessage(i18n, 'con enter');

      fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
      expect(chatApi.sendMessage).not.toHaveBeenCalled();

      fireEvent.keyDown(box, { key: 'Enter' });
      await waitFor(() =>
        expect(chatApi.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ content: 'con enter' }),
        ),
      );
    });

    it('does not send an empty message', async () => {
      const i18n = await renderLoadedChat();
      const box = screen.getByPlaceholderText(i18n.t('chat.type_message'));

      typeMessage(i18n, '   ');
      fireEvent.keyDown(box, { key: 'Enter' });
      fireEvent.submit(box.closest('form')!);

      expect(chatApi.sendMessage).not.toHaveBeenCalled();
    });

    it('gives the text back and says so when the message cannot be sent', async () => {
      vi.mocked(chatApi.sendMessage).mockRejectedValue(new Error('down'));
      const i18n = await renderLoadedChat();

      typeMessage(i18n, 'no llega');
      send(i18n);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(i18n.t('chat.send_error')),
      );
      expect(
        screen.getByPlaceholderText(i18n.t('chat.type_message')),
      ).toHaveValue('no llega');
      expect(screen.getAllByTestId(/^message-/)).toHaveLength(2);
    });
  });

  describe('replying, editing and deleting', () => {
    it('sends a reply to the chosen message, or cancels it', async () => {
      const i18n = await renderLoadedChat();

      fireEvent.click(screen.getByRole('button', { name: 'reply m1' }));
      expect(
        screen.getByText(
          i18n.t('chat.replying_to', { username: i18n.t('chat.user') }),
        ),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.cancel_reply') }),
      );
      expect(
        screen.queryByText(
          i18n.t('chat.replying_to', { username: i18n.t('chat.user') }),
        ),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'reply m1' }));
      typeMessage(i18n, 'respuesta');
      send(i18n);

      await waitFor(() =>
        expect(chatApi.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ content: 'respuesta', replyToId: 'm1' }),
        ),
      );
    });

    it('hides the text of an encrypted message in the reply preview', async () => {
      vi.mocked(chatApi.getMessages).mockResolvedValue({
        data: [message('m9', 'p2', '{"ciphertext":"abc"}')],
      } as never);
      const { i18n } = renderChat();
      await screen.findByTestId('message-m9');

      fireEvent.click(screen.getByRole('button', { name: 'reply m9' }));

      expect(
        screen.getByText(`🔒 ${i18n!.t('chat.secure_message')}`),
      ).toBeInTheDocument();
    });

    it('edits a message instead of sending a new one, without waiting for the live event', async () => {
      vi.mocked(chatApi.editMessage).mockResolvedValue({
        data: { ...message('m2', 'me', 'qué tal estás'), isEdited: true },
      } as never);
      const i18n = await renderLoadedChat();

      fireEvent.click(screen.getByRole('button', { name: 'edit m2' }));
      expect(
        screen.getByText(i18n.t('chat.editing_message')),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(i18n.t('chat.type_message')),
      ).toHaveValue('qué tal');

      typeMessage(i18n, 'qué tal estás');
      send(i18n);

      expect(await screen.findByText('qué tal estás')).toBeInTheDocument();
      expect(chatApi.editMessage).toHaveBeenCalledWith('m2', 'qué tal estás');
      expect(chatApi.sendMessage).not.toHaveBeenCalled();
      expect(screen.getAllByTestId(/^message-/)).toHaveLength(2);
    });

    it('keeps the old text when the edit is refused', async () => {
      vi.mocked(chatApi.editMessage).mockRejectedValue(new Error('down'));
      const i18n = await renderLoadedChat();

      fireEvent.click(screen.getByRole('button', { name: 'edit m2' }));
      typeMessage(i18n, 'no se guarda');
      send(i18n);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(i18n.t('chat.send_error')),
      );
      expect(screen.getByText('qué tal')).toBeInTheDocument();
    });

    it('shows a message edited by the other person as it arrives', async () => {
      await renderLoadedChat();

      emit('message_edited', message('m1', 'p2', 'hola a todos'));
      emit('message_edited', {
        ...message('m1', 'p2', 'otra conversación'),
        conversationId: 'c2',
      });

      expect(screen.getByText('hola a todos')).toBeInTheDocument();
    });

    it('leaves editing without changing the message', async () => {
      const i18n = await renderLoadedChat();
      fireEvent.click(screen.getByRole('button', { name: 'edit m2' }));

      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.cancel_edit') }),
      );

      expect(
        screen.queryByText(i18n.t('chat.editing_message')),
      ).not.toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(i18n.t('chat.type_message')),
      ).toHaveValue('');
    });

    it('deletes a message, and says so when it cannot', async () => {
      vi.mocked(chatApi.deleteMessage).mockResolvedValueOnce({} as never);
      const i18n = await renderLoadedChat();

      fireEvent.click(screen.getByRole('button', { name: 'delete m2' }));

      expect(await screen.findByText('deleted message')).toBeInTheDocument();
      expect(chatApi.deleteMessage).toHaveBeenCalledWith('m2');

      vi.mocked(chatApi.deleteMessage).mockRejectedValueOnce(new Error('down'));
      fireEvent.click(screen.getByRole('button', { name: 'delete m1' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n.t('chat.delete_message_error'),
        ),
      );
      expect(screen.getByText('hola')).toBeInTheDocument();
    });
  });

  describe('reactions', () => {
    it('adds my reaction, tells the server and removes it when chosen again', async () => {
      await renderLoadedChat();

      fireEvent.click(screen.getByRole('button', { name: 'react m1' }));

      expect(socket.emit).toHaveBeenCalledWith('send_reaction', {
        messageId: 'm1',
        conversationId: 'c1',
        reaction: '🔥',
      });
      expect(screen.getByTestId('reactions-m1')).toHaveTextContent('me:🔥');

      fireEvent.click(screen.getByRole('button', { name: 'react m1' }));
      expect(screen.getByTestId('reactions-m1')).toHaveTextContent('');
    });

    it('shows the reactions of other people as they arrive', async () => {
      await renderLoadedChat();

      emit('message_reaction', {
        messageId: 'm2',
        profileId: 'p2',
        reaction: '❤️',
      });
      expect(screen.getByTestId('reactions-m2')).toHaveTextContent('p2:❤️');

      emit('message_reaction', {
        messageId: 'm2',
        userId: 'p2',
        reaction: '😂',
      });
      expect(screen.getByTestId('reactions-m2')).toHaveTextContent('p2:😂');

      emit('message_reaction', { messageId: 'm2', reaction: '👍' });
      expect(screen.getByTestId('reactions-m2')).toHaveTextContent('p2:😂');
    });
  });

  describe('messages arriving while the conversation is open', () => {
    it('adds a new message and marks it as read', async () => {
      await renderLoadedChat();
      await waitFor(() => expect(chatApi.markAsRead).toHaveBeenCalledTimes(1));

      emit('receiveMessage', message('m3', 'p2', 'recién llegado'));

      expect(screen.getByText('recién llegado')).toBeInTheDocument();
      await waitFor(() => expect(chatApi.markAsRead).toHaveBeenCalledTimes(2));
      expect(socketState.markRead).toHaveBeenLastCalledWith('c1', 'p2');
    });

    it('ignores messages of other conversations and repeated ones', async () => {
      await renderLoadedChat();

      emit('receiveMessage', {
        ...message('m4', 'p2', 'otra conversación'),
        conversationId: 'c2',
      });
      emit('receiveMessage', message('m1', 'p2', 'hola'));

      expect(screen.queryByText('otra conversación')).not.toBeInTheDocument();
      expect(screen.getAllByTestId(/^message-/)).toHaveLength(2);
    });

    it('removes a message that was deleted for everyone', async () => {
      await renderLoadedChat();

      emit('message_deleted', { messageId: 'm1' });

      expect(screen.getByText('deleted message')).toBeInTheDocument();
      expect(screen.queryByText('hola')).not.toBeInTheDocument();
    });
  });

  describe('message requests', () => {
    beforeEach(() => {
      vi.mocked(chatApi.getConversation).mockResolvedValue({
        data: directConversation({
          participants: [
            { id: 'cp1', profileId: 'me', profile: ME, hasAccepted: false },
            { id: 'cp2', profileId: 'p2', profile: ANA, hasAccepted: true },
          ],
        }),
      } as never);
    });

    it('asks before answering and does not reveal that the request was read', async () => {
      const i18n = await renderLoadedChat();

      expect(
        await screen.findByText(i18n.t('chat.request_title')),
      ).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText(i18n.t('chat.type_message')),
      ).not.toBeInTheDocument();
      expect(chatApi.markAsRead).not.toHaveBeenCalled();
      expect(socketState.markRead).not.toHaveBeenCalled();

      emit('receiveMessage', message('m3', 'p2', 'sigues ahí?'));

      expect(screen.getByText('sigues ahí?')).toBeInTheDocument();
      expect(chatApi.markAsRead).not.toHaveBeenCalled();
    });

    it('accepts the request and opens the message box', async () => {
      vi.mocked(chatApi.acceptRequest).mockResolvedValue({} as never);
      const i18n = await renderLoadedChat();

      fireEvent.click(
        await screen.findByRole('button', { name: i18n.t('chat.accept') }),
      );

      expect(
        await screen.findByPlaceholderText(i18n.t('chat.type_message')),
      ).toBeInTheDocument();
      expect(chatApi.acceptRequest).toHaveBeenCalledWith('c1');
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          i18n.t('chat.request_accepted'),
        ),
      );
      expect(chatApi.markAsRead).toHaveBeenCalledWith('c1');
    });

    it('says so when the request cannot be accepted', async () => {
      vi.mocked(chatApi.acceptRequest).mockRejectedValue(new Error('down'));
      const i18n = await renderLoadedChat();

      fireEvent.click(
        await screen.findByRole('button', { name: i18n.t('chat.accept') }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n.t('chat.request_accept_error'),
        ),
      );
      expect(
        screen.getByText(i18n.t('chat.request_title')),
      ).toBeInTheDocument();
    });

    it('declines the request and returns to the inbox', async () => {
      vi.mocked(chatApi.declineRequest).mockResolvedValue({} as never);
      const i18n = await renderLoadedChat();

      fireEvent.click(
        await screen.findByRole('button', { name: i18n.t('chat.decline') }),
      );

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/direct/inbox'),
      );
      expect(chatApi.declineRequest).toHaveBeenCalledWith('c1');
      expect(toast.success).toHaveBeenCalledWith(
        i18n.t('chat.request_declined'),
      );
    });

    it('says so when the request cannot be declined', async () => {
      vi.mocked(chatApi.declineRequest).mockRejectedValue(new Error('down'));
      const i18n = await renderLoadedChat();

      fireEvent.click(
        await screen.findByRole('button', { name: i18n.t('chat.decline') }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n.t('chat.request_decline_error'),
        ),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('deleting the conversation', () => {
    async function openMenu() {
      const i18n = await renderLoadedChat();
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.more_options') }),
      );
      return i18n;
    }

    it.each([
      ['chat.delete_for_me', 'me'],
      ['chat.delete_for_everyone', 'both'],
    ] as const)('%s deletes it and returns to the inbox', async (key, mode) => {
      vi.mocked(chatApi.deleteConversation).mockResolvedValue({} as never);
      const i18n = await openMenu();

      fireEvent.click(screen.getByRole('button', { name: i18n.t(key) }));

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/direct/inbox'),
      );
      expect(chatApi.deleteConversation).toHaveBeenCalledWith('c1', mode);
    });

    it.each([
      ['chat.delete_for_me', 'me'],
      ['chat.delete_for_everyone', 'both'],
    ] as const)(
      '%s from the details deletes it too, and closes them',
      async (key, mode) => {
        vi.mocked(chatApi.deleteConversation).mockResolvedValue({} as never);
        const i18n = await renderLoadedChat();
        fireEvent.click(await screen.findByText('Ana Ruiz'));
        const details = await screen.findByRole('dialog', {
          name: i18n.t('chat.details.title'),
        });

        fireEvent.click(
          within(details).getByRole('button', {
            name: new RegExp(i18n.t(key)),
          }),
        );

        await waitFor(() =>
          expect(chatApi.deleteConversation).toHaveBeenCalledWith('c1', mode),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      },
    );

    it('closes the details and stays in the conversation', async () => {
      const i18n = await renderLoadedChat();
      fireEvent.click(await screen.findByText('Ana Ruiz'));
      const details = await screen.findByRole('dialog', {
        name: i18n.t('chat.details.title'),
      });

      fireEvent.click(
        within(details).getByRole('button', {
          name: i18n.t('common.close_dialog'),
        }),
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(chatApi.deleteConversation).not.toHaveBeenCalled();
    });

    it('stays in the conversation and says so when it cannot be deleted', async () => {
      vi.mocked(chatApi.deleteConversation).mockRejectedValue(
        new Error('down'),
      );
      const i18n = await openMenu();

      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.delete_for_me') }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n.t('chat.delete_chat_error'),
        ),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('closes the menu without deleting', async () => {
      const i18n = await openMenu();

      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('common.close_menu') }),
      );

      expect(
        screen.queryByRole('button', { name: i18n.t('chat.delete_for_me') }),
      ).not.toBeInTheDocument();
      expect(chatApi.deleteConversation).not.toHaveBeenCalled();
    });
  });

  describe('calls', () => {
    it.each([
      ['chat.audio_call', 'audio'],
      ['chat.video_call', 'video'],
    ] as const)('%s starts a call with the other person', async (key, kind) => {
      const i18n = await renderLoadedChat();

      fireEvent.click(await screen.findByRole('button', { name: i18n.t(key) }));

      expect(initiateCall).toHaveBeenCalledWith('p2', kind, {
        id: 'p2',
        profile: { username: 'ana', fullName: 'Ana Ruiz', avatar: 'ana.jpg' },
      });
    });
  });

  describe('paid messages', () => {
    async function lockAt(i18n: I18nInstance, price: string) {
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.lock_message') }),
      );
      fireEvent.change(
        screen.getByLabelText(i18n.t('chat.lock_message_price_label')),
        { target: { value: price } },
      );
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('chat.lock_message_confirm'),
        }),
      );
    }

    it('sends the next message locked at the chosen price, in cents', async () => {
      const i18n = await renderLoadedChat();

      await lockAt(i18n, '4.50');

      expect(
        screen.getByText(i18n.t('chat.locked_chip_label', { price: '€4.50' })),
      ).toBeInTheDocument();

      typeMessage(i18n, 'contenido exclusivo');
      send(i18n);

      await waitFor(() =>
        expect(chatApi.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            content: 'contenido exclusivo',
            isLocked: true,
            priceCents: 450,
          }),
        ),
      );
      expect(
        screen.queryByText(
          i18n.t('chat.locked_chip_label', { price: '€4.50' }),
        ),
      ).not.toBeInTheDocument();
    });

    it.each(['2.99', '500.01', 'abc'])(
      'does not lock at a price outside the allowed range (%s)',
      async (price) => {
        const i18n = await renderLoadedChat();

        await lockAt(i18n, price);

        expect(screen.getByRole('alert')).toHaveTextContent(
          i18n.t('chat.lock_message_range_error', {
            min: '€3.00',
            max: '€500.00',
          }),
        );
        const chipStart = i18n
          .t('chat.locked_chip_label', { price: '' })
          .trim();
        expect(
          screen.queryByText((text) => text.startsWith(chipStart)),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole('button', {
            name: i18n.t('chat.lock_message_confirm'),
          }),
        ).toBeInTheDocument();
      },
    );

    it('clears the price warning once the price is changed', async () => {
      const i18n = await renderLoadedChat();
      await lockAt(i18n, '1');
      expect(screen.getByRole('alert')).toBeInTheDocument();

      fireEvent.change(
        screen.getByLabelText(i18n.t('chat.lock_message_price_label')),
        { target: { value: '10' } },
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('removes the lock from the chip or from the price box', async () => {
      const i18n = await renderLoadedChat();
      const chip = i18n.t('chat.locked_chip_label', { price: '€5.00' });

      await lockAt(i18n, '5');
      expect(screen.getByText(chip)).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('chat.lock_message_cancel'),
        }),
      );
      expect(screen.queryByText(chip)).not.toBeInTheDocument();

      await lockAt(i18n, '5');
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.lock_message') }),
      );
      fireEvent.click(
        screen
          .getAllByRole('button', { name: i18n.t('chat.lock_message_cancel') })
          .at(-1)!,
      );
      expect(screen.queryByText(chip)).not.toBeInTheDocument();
    });

    it('opens the checkout to unlock a message and says so when it fails', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { url: `${window.location.href}#checkout` },
      } as never);
      const i18n = await renderLoadedChat();

      fireEvent.click(screen.getByRole('button', { name: 'unlock m1' }));

      await waitFor(() => expect(window.location.hash).toBe('#checkout'));
      expect(apiClient.post).toHaveBeenCalledWith(
        '/monetization/unlock-message',
        { messageId: 'm1', returnUrl: expect.any(String) },
      );
      expect(vi.mocked(apiClient.post).mock.calls[0][1]).not.toHaveProperty(
        'priceCents',
      );

      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('down'));
      fireEvent.click(screen.getByRole('button', { name: 'unlock m1' }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n.t('monetization.failed_to_unlock'),
        ),
      );
      window.location.hash = '';
    });

    it('thanks and reloads the messages after a paid unlock', async () => {
      const i18n = await renderLoadedChat(
        '/direct/t/c1?success=true&session_id=cs_1',
      );

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          i18n.t('chat.unlock_success'),
        ),
      );
      await waitFor(() => expect(chatApi.getMessages).toHaveBeenCalledTimes(2));
    });

    it('says the unlock was cancelled when the checkout is abandoned', async () => {
      const i18n = await renderLoadedChat('/direct/t/c1?canceled=true');

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          i18n.t('chat.unlock_canceled'),
        ),
      );
      expect(chatApi.getMessages).toHaveBeenCalledTimes(1);
    });
  });

  describe('emojis', () => {
    it('puts the chosen emoji where the cursor is and keeps the panel open', async () => {
      const i18n = await renderLoadedChat();
      const box = screen.getByPlaceholderText(
        i18n.t('chat.type_message'),
      ) as HTMLTextAreaElement;
      typeMessage(i18n, 'hola');
      box.setSelectionRange(2, 2);

      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.add_emoji') }),
      );
      fireEvent.click(screen.getByRole('button', { name: '🎉' }));

      expect(box).toHaveValue('ho🎉la');
      expect(
        screen.getByRole('group', { name: i18n.t('chat.emoji_panel') }),
      ).toBeInTheDocument();
    });

    it('adds an emoji to an empty message and sends it', async () => {
      const i18n = await renderLoadedChat();

      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.add_emoji') }),
      );
      fireEvent.click(screen.getByRole('button', { name: '❤️' }));
      send(i18n);

      await waitFor(() =>
        expect(chatApi.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ content: '❤️' }),
        ),
      );
      expect(
        screen.queryByRole('group', { name: i18n.t('chat.emoji_panel') }),
      ).not.toBeInTheDocument();
    });

    it('closes the panel from its button', async () => {
      const i18n = await renderLoadedChat();
      const toggle = screen.getByRole('button', {
        name: i18n.t('chat.add_emoji'),
      });

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(toggle);

      expect(
        screen.queryByRole('group', { name: i18n.t('chat.emoji_panel') }),
      ).not.toBeInTheDocument();
    });
  });

  describe('images', () => {
    const image = (size = 1024) => {
      const file = new File(['x'], 'foto.png', { type: 'image/png' });
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };
    const fileInput = () =>
      document.querySelector('input[type="file"]') as HTMLInputElement;

    it('uploads the image and sends it as a message', async () => {
      vi.mocked(uploadApi.upload).mockResolvedValue({
        data: { url: 'https://cdn.test/foto.png' },
      } as never);
      const i18n = await renderLoadedChat();

      fireEvent.change(fileInput(), { target: { files: [image()] } });

      await waitFor(() =>
        expect(chatApi.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            conversationId: 'c1',
            mediaUrl: 'https://cdn.test/foto.png',
            mediaType: 'image',
          }),
        ),
      );
      expect(
        JSON.parse(vi.mocked(chatApi.sendMessage).mock.calls[0][0].content),
      ).toEqual({
        text: i18n.t('chat.sent_image'),
        originalName: 'foto.png',
        originalType: 'image/png',
      });
      await waitFor(() =>
        expect(
          screen.queryByText(i18n.t('chat.uploading_attachment')),
        ).not.toBeInTheDocument(),
      );
    });

    it('refuses an image over 50 MB', async () => {
      const i18n = await renderLoadedChat();

      fireEvent.change(fileInput(), {
        target: { files: [image(50 * 1024 * 1024 + 1)] },
      });

      expect(toast.error).toHaveBeenCalledWith(i18n.t('chat.file_too_large'));
      expect(uploadApi.upload).not.toHaveBeenCalled();
    });

    it('says so when the image cannot be uploaded', async () => {
      vi.mocked(uploadApi.upload).mockRejectedValue(new Error('down'));
      const i18n = await renderLoadedChat();

      fireEvent.change(fileInput(), { target: { files: [image()] } });

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(i18n.t('chat.send_error')),
      );
      expect(chatApi.sendMessage).not.toHaveBeenCalled();
      expect(screen.getAllByTestId(/^message-/)).toHaveLength(2);
    });

    it('opens the file chooser when the device has no native picker', async () => {
      const i18n = await renderLoadedChat();
      const click = vi.spyOn(fileInput(), 'click');

      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.attach_image') }),
      );

      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(pickNativeImage).toHaveBeenCalled();
    });
  });

  describe('voice notes', () => {
    async function record(i18n: I18nInstance) {
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('chat.record_voice') }),
      );
    }

    it('sends the recorded voice note', async () => {
      const i18n = await renderLoadedChat();
      await record(i18n);

      fireEvent.click(
        screen.getByRole('button', { name: 'send recorded voice' }),
      );

      await waitFor(() =>
        expect(chatApi.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            conversationId: 'c1',
            content: i18n.t('chat.voice_note'),
            voiceUrl: 'https://cdn.test/voice.webm',
            voiceDuration: 3,
            voiceWaveform: [1, 2],
          }),
        ),
      );
      expect(
        await screen.findByPlaceholderText(i18n.t('chat.type_message')),
      ).toBeInTheDocument();
    });

    it('says so when the voice note cannot be sent', async () => {
      vi.mocked(chatApi.sendMessage).mockRejectedValue(new Error('down'));
      const i18n = await renderLoadedChat();
      await record(i18n);

      fireEvent.click(
        screen.getByRole('button', { name: 'send recorded voice' }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(i18n.t('chat.send_error')),
      );
      expect(screen.getAllByTestId(/^message-/)).toHaveLength(2);
    });

    it('returns to the message box when the recording is cancelled', async () => {
      const i18n = await renderLoadedChat();
      await record(i18n);

      fireEvent.click(screen.getByRole('button', { name: 'cancel recording' }));

      expect(
        screen.getByPlaceholderText(i18n.t('chat.type_message')),
      ).toBeInTheDocument();
      expect(chatApi.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('group conversations', () => {
    beforeEach(() => {
      vi.mocked(chatApi.getConversation).mockResolvedValue({
        data: groupConversation(),
      } as never);
    });

    it('shows the group, its size and no call buttons', async () => {
      const i18n = await renderLoadedChat();

      expect(await screen.findByText('Trip')).toBeInTheDocument();
      expect(
        screen.getByText(i18n.t('chat.members', { count: 3 })),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: i18n.t('chat.audio_call') }),
      ).not.toBeInTheDocument();
      expect(socketState.markRead).not.toHaveBeenCalled();

      typeMessage(i18n, 'hola grupo');
      expect(socketState.startTyping).not.toHaveBeenCalled();
    });

    it('names who is typing, or how many', async () => {
      socketState.typingUsers = { c1: ['p2'] };
      const i18n = await renderLoadedChat();

      expect(
        await screen.findByText(i18n.t('chat.is_typing', { username: 'ana' })),
      ).toBeInTheDocument();
    });

    it('counts the people typing when there are several', async () => {
      socketState.typingUsers = { c1: ['p2', 'p3'] };
      const i18n = await renderLoadedChat();

      expect(
        await screen.findByText(i18n.t('chat.people_typing', { count: 2 })),
      ).toBeInTheDocument();
    });

    it('renames the group, removes a member and leaves from the details', async () => {
      vi.mocked(chatApi.updateGroup).mockResolvedValue({
        data: { ...groupConversation(), name: 'Renamed' },
      } as never);
      vi.mocked(chatApi.removeParticipant).mockResolvedValue({
        data: {
          ...groupConversation(),
          name: 'Renamed',
          participants: groupConversation().participants.slice(0, 2),
        },
      } as never);
      vi.mocked(chatApi.leaveGroup).mockResolvedValue({} as never);
      const i18n = await renderLoadedChat();

      fireEvent.click(await screen.findByText('Trip'));
      fireEvent.click(screen.getByRole('button', { name: 'rename group' }));

      expect(await screen.findByText('Renamed')).toBeInTheDocument();
      expect(chatApi.updateGroup).toHaveBeenCalledWith('c1', {
        name: 'Renamed',
      });

      fireEvent.click(screen.getByRole('button', { name: 'remove member' }));
      expect(
        await screen.findByText(i18n.t('chat.members', { count: 2 })),
      ).toBeInTheDocument();
      expect(chatApi.removeParticipant).toHaveBeenCalledWith('c1', 'p3');

      fireEvent.click(screen.getByRole('button', { name: 'leave group' }));
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/direct/inbox'),
      );

      fireEvent.click(screen.getByRole('button', { name: 'close details' }));
      expect(screen.queryByTestId('group-details')).not.toBeInTheDocument();
    });

    it('keeps the group as it was when a change fails', async () => {
      vi.mocked(chatApi.updateGroup).mockRejectedValue(new Error('down'));
      vi.mocked(chatApi.removeParticipant).mockRejectedValue(new Error('down'));
      vi.mocked(chatApi.leaveGroup).mockRejectedValue(new Error('down'));
      const i18n = await renderLoadedChat();

      fireEvent.click(await screen.findByText('Trip'));
      fireEvent.click(screen.getByRole('button', { name: 'rename group' }));
      fireEvent.click(screen.getByRole('button', { name: 'remove member' }));
      fireEvent.click(screen.getByRole('button', { name: 'leave group' }));

      await waitFor(() => expect(chatApi.leaveGroup).toHaveBeenCalled());
      expect(screen.getAllByText('Trip').length).toBeGreaterThan(0);
      expect(
        screen.getByText(i18n.t('chat.members', { count: 3 })),
      ).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
