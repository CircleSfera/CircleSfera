import { toast } from 'react-hot-toast';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { apiClient } from '../services/api';
import { chatApi } from '../services/chat.service';
import { logger } from '../utils/logger';
import { useAuthStore } from './authStore';
import { useNotificationsStore } from './notificationsStore';

interface SocketWithRetry extends Socket {
  _refreshRetryCount?: number;
}

interface SocketState {
  socket: SocketWithRetry | null;
  isConnected: boolean;
  typingUsers: Record<string, string[]>; // conversationId -> userIds
  userStatuses: Record<string, { isOnline: boolean; lastSeenAt?: string }>; // userId -> status
  connect: () => void;
  disconnect: () => void;
  startTyping: (conversationId: string, recipientId: string) => void;
  stopTyping: (conversationId: string, recipientId: string) => void;
  markRead: (conversationId: string, recipientId?: string) => void;
}

// In production, this points to the base domain (e.g., https://circlesfera.com)
// The /api/v1 prefix is handled via the 'path' option in Socket.io
const SOCKET_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/v1\/?$/, '')
  : '';

/**
 * Socket store with cookie-based authentication.
 *
 * Tokens are stored as HTTP-only cookies and sent automatically
 * via `withCredentials: true`. No manual token injection needed.
 */
export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  typingUsers: {},
  userStatuses: {},

  connect: () => {
    const { socket } = get();
    const { isAuthenticated } = useAuthStore.getState();

    if (!isAuthenticated) {
      logger.warn('Cannot connect to socket: Not authenticated');
      return;
    }

    // Reuse existing socket if available
    if (socket) {
      if (!socket.connected) {
        socket.connect();
      }
      return;
    }

    const newSocket = io(`${SOCKET_BASE_URL}/events`, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['polling', 'websocket'],
      autoConnect: false,
    });

    newSocket.on('connect', () => {
      logger.log('Socket connected:', newSocket.id);
      set({ isConnected: true });
    });

    newSocket.on('disconnect', (reason) => {
      logger.log('Socket disconnected:', reason);
      set({ isConnected: false });
    });

    // --- Chat Events ---
    newSocket.on('receiveMessage', async () => {
      // Fetch latest unread count when a new message arrives
      try {
        const res = await chatApi.getUnreadCount();
        useNotificationsStore.getState().setUnreadMessagesCount(res.data.count);
      } catch (err) {
        logger.error('Failed to update unread count', err);
      }
    });

    newSocket.on('messages_read', async () => {
      try {
        const res = await chatApi.getUnreadCount();
        useNotificationsStore.getState().setUnreadMessagesCount(res.data.count);
      } catch (err) {
        logger.error('Failed to update unread count', err);
      }
    });

    newSocket.on(
      'user_typing',
      ({
        userId,
        conversationId,
      }: {
        userId: string;
        conversationId: string;
      }) => {
        set((state) => {
          const currentTyping = state.typingUsers[conversationId] || [];
          if (!currentTyping.includes(userId)) {
            return {
              typingUsers: {
                ...state.typingUsers,
                [conversationId]: [...currentTyping, userId],
              },
            };
          }
          return state;
        });
      },
    );

    newSocket.on(
      'user_stopped_typing',
      ({
        userId,
        conversationId,
      }: {
        userId: string;
        conversationId: string;
      }) => {
        set((state) => {
          const currentTyping = state.typingUsers[conversationId] || [];
          return {
            typingUsers: {
              ...state.typingUsers,
              [conversationId]: currentTyping.filter((id) => id !== userId),
            },
          };
        });
      },
    );

    newSocket.on(
      'user_status',
      ({
        userId,
        isOnline,
        lastSeenAt,
      }: {
        userId: string;
        isOnline: boolean;
        lastSeenAt?: string;
      }) => {
        set((state) => ({
          userStatuses: {
            ...state.userStatuses,
            [userId]: { isOnline, lastSeenAt },
          },
        }));
      },
    );

    // --- Notification Events ---
    newSocket.on('notification', (notification) => {
      logger.log('Received notification:', notification);
      useNotificationsStore.getState().addNotification(notification);

      // Show toast alert
      const senderName =
        notification.sender?.profile?.fullName ||
        notification.sender?.profile?.username ||
        'Someone';
      toast.success(`${senderName} ${notification.content}`, {
        icon: '🔔',
        style: {
          borderRadius: '12px',
          background: '#1A1A1A',
          color: '#FFFFFF',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        },
      });
    });

    newSocket.on('connect_error', async (err) => {
      const errorData = err as unknown as Record<string, unknown>;
      logger.error('Socket connection error detail:', {
        message: err.message,
        description: errorData.description,
        context: errorData.context,
        type: err.name,
      });

      const isAuthError =
        err.message === 'jwt expired' ||
        err.message === 'Unauthorized' ||
        err.message.includes('jwt') ||
        err.message === 'No token found' ||
        err.message.includes('csrf') ||
        err.message.includes('token');

      // Prevent infinite refresh loops
      const socket = newSocket as SocketWithRetry;
      const retryCount = socket._refreshRetryCount || 0;
      if (isAuthError && retryCount < 3) {
        socket._refreshRetryCount = retryCount + 1;
        logger.log(
          `Socket auth/CSRF error (attempt ${retryCount + 1}) — attempting session refresh...`,
        );
        try {
          // Re-validate session and CSRF via refresh
          await apiClient.post('/auth/refresh');

          logger.log('Socket: Session refresh successful, reconnecting...');

          // Reconnect with jitter
          setTimeout(
            () => {
              if (get().isConnected) return;
              newSocket.connect();
            },
            500 + Math.random() * 500,
          );
        } catch (refreshErr) {
          logger.error('Socket: Session refresh failed', refreshErr);
          useAuthStore.getState().logout();
        }
      } else if (isAuthError) {
        logger.error('Socket: Max refresh attempts reached. Logging out.');
        useAuthStore.getState().logout();
      }
    });

    set({ socket: newSocket });

    // Connect immediately if authenticated, no need for arbitrary delay
    if (isAuthenticated) {
      newSocket.connect();
    }

    // Handle mobile browser sleep/wake (Page Visibility API)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentSocket = get().socket;
        if (
          useAuthStore.getState().isAuthenticated &&
          currentSocket &&
          !currentSocket.connected
        ) {
          logger.log('Socket: App became visible, forcing reconnection...');
          currentSocket.connect();
        }
      }
    };

    // Remove any existing listener to prevent duplicates
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({
        socket: null,
        isConnected: false,
        typingUsers: {},
        userStatuses: {},
      });
    }
  },

  startTyping: (conversationId, recipientId) => {
    const { socket } = get();
    socket?.emit('typing_start', { conversationId, recipientId });
  },

  stopTyping: (conversationId, recipientId) => {
    const { socket } = get();
    socket?.emit('typing_stop', { conversationId, recipientId });
  },

  markRead: (conversationId, recipientId) => {
    const { socket } = get();
    socket?.emit('mark_read', { conversationId, recipientId });
  },
}));
