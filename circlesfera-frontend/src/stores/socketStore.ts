import { type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { realtimeService } from '../services/realtime.service';

interface SocketWithRetry extends Socket {
  _refreshRetryCount?: number;
}

interface SocketState {
  socket: SocketWithRetry | null;
  isConnected: boolean;
  typingUsers: Record<string, string[]>; // ConversationId -> userIds
  userStatuses: Record<string, { isOnline: boolean; lastSeenAt?: string }>;
  connect: () => void;
  disconnect: () => void;
  startTyping: (conversationId: string, recipientId: string) => void;
  stopTyping: (conversationId: string, recipientId: string) => void;
  markRead: (conversationId: string, recipientId?: string) => void;
}

// Socket store no longer owns the Socket lifecycle (FE-006)
// It only holds the reactive state and delegates to realtime.service.ts
export const useSocketStore = create<SocketState>(() => ({
  socket: null,
  isConnected: false,
  typingUsers: {},
  userStatuses: {},

  connect: () => {
    realtimeService.connect();
  },

  disconnect: () => {
    realtimeService.disconnect();
  },

  startTyping: (conversationId, recipientId) => {
    realtimeService.startTyping(conversationId, recipientId);
  },

  stopTyping: (conversationId, recipientId) => {
    realtimeService.stopTyping(conversationId, recipientId);
  },

  markRead: (conversationId, recipientId) => {
    realtimeService.markRead(conversationId, recipientId);
  },
}));
