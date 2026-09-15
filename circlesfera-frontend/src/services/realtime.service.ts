import { toast } from 'react-hot-toast';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useSocketStore } from '../stores/socketStore';
import { logger } from '../utils/logger';
import { apiClient } from './api';
import { chatApi } from './chat.service';

interface SocketWithRetry extends Socket {
  _refreshRetryCount?: number;
}

const SOCKET_BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/v1\/?$/, '')
  : '';

class RealtimeService {
  private socket: SocketWithRetry | null = null;
  private visibilityHandler: (() => void) | null = null;

  public getSocket(): Socket | null {
    return this.socket;
  }

  public connect() {
    const { isAuthenticated } = useAuthStore.getState();

    if (!isAuthenticated) {
      logger.warn('Cannot connect to socket: Not authenticated');
      return;
    }

    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    this.socket = io(`${SOCKET_BASE_URL}/events`, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['polling', 'websocket'],
      autoConnect: false,
    });

    this.socket.on('connect', () => {
      logger.log('Socket connected:', this.socket!.id);
      useSocketStore.setState({ isConnected: true, socket: this.socket });
    });

    this.socket.on('disconnect', (reason) => {
      logger.log('Socket disconnected:', reason);
      useSocketStore.setState({ isConnected: false });
    });

    // Chat Events
    this.socket.on('receiveMessage', async () => {
      try {
        const res = await chatApi.getUnreadCount();
        useNotificationsStore.getState().setUnreadMessagesCount(res.data.count);
      } catch (err) {
        logger.error('Failed to update unread count', err);
      }
    });

    this.socket.on('messages_read', async () => {
      try {
        const res = await chatApi.getUnreadCount();
        useNotificationsStore.getState().setUnreadMessagesCount(res.data.count);
      } catch (err) {
        logger.error('Failed to update unread count', err);
      }
    });

    this.socket.on(
      'user_typing',
      ({ profileId, userId, conversationId }: any) => {
        const typerId = profileId ?? userId;
        if (!typerId) return;
        useSocketStore.setState((state) => {
          const currentTyping = state.typingUsers[conversationId] || [];
          if (!currentTyping.includes(typerId)) {
            return {
              typingUsers: {
                ...state.typingUsers,
                [conversationId]: [...currentTyping, typerId],
              },
            };
          }
          return state;
        });
      },
    );

    this.socket.on(
      'user_stopped_typing',
      ({ profileId, userId, conversationId }: any) => {
        const typerId = profileId ?? userId;
        if (!typerId) return;
        useSocketStore.setState((state) => {
          const currentTyping = state.typingUsers[conversationId] || [];
          return {
            typingUsers: {
              ...state.typingUsers,
              [conversationId]: currentTyping.filter((id) => id !== typerId),
            },
          };
        });
      },
    );

    this.socket.on(
      'user_status',
      ({ profileId, userId, isOnline, lastSeenAt }: any) => {
        const statusId = profileId ?? userId;
        if (!statusId) return;
        useSocketStore.setState((state) => ({
          userStatuses: {
            ...state.userStatuses,
            [statusId]: { isOnline, lastSeenAt },
          },
        }));
      },
    );

    // Notification Events
    this.socket.on('notification', (notification) => {
      logger.log('Received notification:', notification);
      useNotificationsStore.getState().addNotification(notification);

      const senderName =
        notification.sender?.fullName ||
        notification.sender?.username ||
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

    this.socket.on('connect_error', async (err) => {
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

      const socket = this.socket as SocketWithRetry;
      const retryCount = socket._refreshRetryCount || 0;
      if (isAuthError && retryCount < 3) {
        socket._refreshRetryCount = retryCount + 1;
        logger.log(
          `Socket auth/CSRF error (attempt ${retryCount + 1}) — attempting session refresh...`,
        );
        try {
          await apiClient.post('/auth/refresh');
          logger.log('Socket: Session refresh successful, reconnecting...');
          setTimeout(
            () => {
              if (useSocketStore.getState().isConnected) return;
              this.socket!.connect();
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

    if (isAuthenticated) {
      this.socket.connect();
    }

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        if (
          useAuthStore.getState().isAuthenticated &&
          this.socket &&
          !this.socket.connected
        ) {
          logger.log('Socket: App became visible, forcing reconnection...');
          this.socket.connect();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    useSocketStore.setState({ socket: this.socket });
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      useSocketStore.setState({
        socket: null,
        isConnected: false,
        typingUsers: {},
        userStatuses: {},
      });
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  public startTyping(conversationId: string, recipientId: string) {
    this.socket?.emit('typing_start', { conversationId, recipientId });
  }

  public stopTyping(conversationId: string, recipientId: string) {
    this.socket?.emit('typing_stop', { conversationId, recipientId });
  }

  public markRead(conversationId: string, recipientId?: string) {
    this.socket?.emit('mark_read', { conversationId, recipientId });
  }
}

export const realtimeService = new RealtimeService();
