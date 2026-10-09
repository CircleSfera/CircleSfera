import { toast } from 'react-hot-toast';
import { io } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/authStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useSocketStore } from '../stores/socketStore';
import { apiClient } from './api';
import { chatApi } from './chat.service';
import { realtimeService } from './realtime.service';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn() } }));
vi.mock('./api', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('./chat.service', () => ({ chatApi: { getUnreadCount: vi.fn() } }));
vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The connection, reduced to what the service drives and hears.
function fakeSocket() {
  const handlers = new Map<string, (payload?: never) => unknown>();
  const socket = {
    id: 'socket-1',
    connected: false,
    on: vi.fn((name: string, run: (payload?: never) => unknown) => {
      handlers.set(name, run);
    }),
    emit: vi.fn(),
    connect: vi.fn(() => {
      socket.connected = true;
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
  };
  return {
    socket,
    receive: (name: string, payload?: unknown) =>
      handlers.get(name)?.(payload as never),
  };
}

describe('realtimeService', () => {
  let line: ReturnType<typeof fakeSocket>;
  const logout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    realtimeService.disconnect();
    line = fakeSocket();
    vi.mocked(io).mockReturnValue(line.socket as never);
    useAuthStore.setState({ isAuthenticated: true, logout } as never);
    useSocketStore.setState({
      socket: null,
      isConnected: false,
      typingUsers: {},
      userStatuses: {},
    });
  });
  afterEach(() => {
    realtimeService.disconnect();
    vi.useRealTimers();
  });

  describe('connecting', () => {
    it('does not connect without a session', () => {
      useAuthStore.setState({ isAuthenticated: false } as never);

      realtimeService.connect();

      expect(io).not.toHaveBeenCalled();
      expect(realtimeService.getSocket()).toBeNull();
    });

    it('opens one connection with the session cookies, and says so once it is up', () => {
      realtimeService.connect();

      expect(io).toHaveBeenCalledWith(
        expect.stringMatching(/\/events$/),
        expect.objectContaining({ path: '/socket.io', withCredentials: true }),
      );
      expect(line.socket.connect).toHaveBeenCalledTimes(1);
      expect(useSocketStore.getState().isConnected).toBe(false);

      line.receive('connect');
      expect(useSocketStore.getState()).toMatchObject({
        isConnected: true,
        socket: line.socket,
      });

      line.receive('disconnect', 'transport close');
      expect(useSocketStore.getState().isConnected).toBe(false);
    });

    it('does not open a second connection: it wakes the one it has', () => {
      realtimeService.connect();
      realtimeService.connect();
      expect(io).toHaveBeenCalledTimes(1);
      expect(line.socket.connect).toHaveBeenCalledTimes(1);

      line.socket.connected = false;
      realtimeService.connect();
      expect(io).toHaveBeenCalledTimes(1);
      expect(line.socket.connect).toHaveBeenCalledTimes(2);
    });

    it('reconnects when the app comes back to the front, only with a session and only if it dropped', () => {
      realtimeService.connect();
      const back = () => document.dispatchEvent(new Event('visibilitychange'));

      back();
      expect(line.socket.connect).toHaveBeenCalledTimes(1);

      line.socket.connected = false;
      back();
      expect(line.socket.connect).toHaveBeenCalledTimes(2);

      line.socket.connected = false;
      useAuthStore.setState({ isAuthenticated: false } as never);
      back();
      expect(line.socket.connect).toHaveBeenCalledTimes(2);
    });

    it('disconnecting closes the line, forgets who was typing or online, and stops listening for the app coming back', () => {
      realtimeService.connect();
      useSocketStore.setState({
        typingUsers: { 'c-1': ['p-1'] },
        userStatuses: { 'p-1': { isOnline: true, lastSeenAt: null } } as never,
      });

      realtimeService.disconnect();

      expect(line.socket.disconnect).toHaveBeenCalled();
      expect(useSocketStore.getState()).toMatchObject({
        socket: null,
        isConnected: false,
        typingUsers: {},
        userStatuses: {},
      });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(line.socket.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('chat', () => {
    beforeEach(() => realtimeService.connect());

    it.each(['receiveMessage', 'messages_read'])(
      'counts the unread messages again on %s',
      async (name) => {
        vi.mocked(chatApi.getUnreadCount).mockResolvedValue({
          data: { count: 4 },
        } as never);

        await line.receive(name);

        expect(useNotificationsStore.getState().unreadMessagesCount).toBe(4);
      },
    );

    it('keeps the last count when the new one cannot be read', async () => {
      useNotificationsStore.getState().setUnreadMessagesCount(2);
      vi.mocked(chatApi.getUnreadCount).mockRejectedValue(new Error('down'));

      await line.receive('receiveMessage');
      await line.receive('messages_read');

      expect(useNotificationsStore.getState().unreadMessagesCount).toBe(2);
    });

    it('shows who is typing in a conversation, once each, and removes them when they stop', () => {
      const typing = () => useSocketStore.getState().typingUsers;

      line.receive('user_typing', { profileId: 'p-1', conversationId: 'c-1' });
      line.receive('user_typing', { profileId: 'p-1', conversationId: 'c-1' });
      // An older server names the account instead of the profile.
      line.receive('user_typing', { userId: 'u-2', conversationId: 'c-1' });
      expect(typing()).toEqual({ 'c-1': ['p-1', 'u-2'] });

      line.receive('user_stopped_typing', {
        profileId: 'p-1',
        conversationId: 'c-1',
      });
      expect(typing()).toEqual({ 'c-1': ['u-2'] });

      line.receive('user_typing', { conversationId: 'c-1' });
      line.receive('user_stopped_typing', { conversationId: 'c-1' });
      expect(typing()).toEqual({ 'c-1': ['u-2'] });
    });

    it('keeps who is online and when they were last seen', () => {
      line.receive('user_status', {
        profileId: 'p-1',
        isOnline: false,
        lastSeenAt: '2026-01-02T03:04:05.000Z',
      });
      line.receive('user_status', { isOnline: true });

      expect(useSocketStore.getState().userStatuses).toEqual({
        'p-1': { isOnline: false, lastSeenAt: '2026-01-02T03:04:05.000Z' },
      });
    });

    it('tells the other person about typing and reading', () => {
      realtimeService.startTyping('c-1', 'p-2');
      realtimeService.stopTyping('c-1', 'p-2');
      realtimeService.markRead('c-1', 'p-2');

      expect(line.socket.emit.mock.calls).toEqual([
        ['typing_start', { conversationId: 'c-1', recipientId: 'p-2' }],
        ['typing_stop', { conversationId: 'c-1', recipientId: 'p-2' }],
        ['mark_read', { conversationId: 'c-1', recipientId: 'p-2' }],
      ]);
    });
  });

  it('adds a notification that arrives and shows it, naming who it is from', () => {
    realtimeService.connect();
    const before = useNotificationsStore.getState().liveNotifications.length;

    line.receive('notification', {
      id: 'n-1',
      content: 'liked your post',
      sender: { username: 'ana', fullName: 'Ana Pérez' },
    });
    line.receive('notification', {
      id: 'n-2',
      content: 'followed you',
      sender: { username: 'luis' },
    });
    line.receive('notification', { id: 'n-3', content: 'sent you a tip' });

    expect(useNotificationsStore.getState().liveNotifications).toHaveLength(
      before + 3,
    );
    expect(vi.mocked(toast.success).mock.calls.map(([text]) => text)).toEqual([
      'Ana Pérez liked your post',
      'luis followed you',
      'Someone sent you a tip',
    ]);
  });

  describe('a refused connection', () => {
    beforeEach(() => realtimeService.connect());
    const refuse = (message: string) =>
      line.receive('connect_error', Object.assign(new Error(message), {}));

    it('renews the session and connects again when the session had expired', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({} as never);

      await refuse('jwt expired');
      expect(apiClient.post).toHaveBeenCalledWith('/auth/refresh');

      await vi.advanceTimersByTimeAsync(1100);
      expect(line.socket.connect).toHaveBeenCalledTimes(2);
      expect(logout).not.toHaveBeenCalled();
    });

    it('does not connect again if it is already back up by then', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({} as never);

      await refuse('Unauthorized');
      useSocketStore.setState({ isConnected: true });
      await vi.advanceTimersByTimeAsync(1100);

      expect(line.socket.connect).toHaveBeenCalledTimes(1);
    });

    it('signs the person out when the session cannot be renewed', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('refresh failed'));

      await refuse('No token found');

      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('gives up after three tries and signs the person out', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({} as never);

      await refuse('invalid csrf token');
      await refuse('invalid csrf token');
      await refuse('invalid csrf token');
      expect(logout).not.toHaveBeenCalled();

      await refuse('invalid csrf token');
      expect(apiClient.post).toHaveBeenCalledTimes(3);
      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('leaves the session alone when the failure is not about the session', async () => {
      await refuse('xhr poll error');

      expect(apiClient.post).not.toHaveBeenCalled();
      expect(logout).not.toHaveBeenCalled();
    });
  });
});
