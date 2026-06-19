import type { Conversation, Message } from '../types';
import { apiClient } from './api';

export const chatApi = {
  getConversations: () => apiClient.get<Conversation[]>('/chat/conversations'),

  getUnreadCount: () =>
    apiClient.get<{ count: number }>('/chat/conversations/unread-count'),

  getMessages: (conversationId: string) =>
    apiClient.get<Message[]>(`/chat/conversations/${conversationId}/messages`),

  sendMessage: (data: {
    recipientId?: string;
    content: string;
    url?: string;
    mediaType?: string;
    conversationId?: string;
    tempId?: string;
    postId?: string;
    storyId?: string;
    replyToId?: string;
    e2eKeys?: Record<string, string>;
  }) => apiClient.post<Message>('/chat/messages', data),

  markAsRead: (conversationId: string) =>
    apiClient.put(`/chat/conversations/${conversationId}/read`),

  createGroup: (data: { participantIds: string[]; name?: string }) =>
    apiClient.post<Conversation>('/chat/conversations', data),

  deleteConversation: (id: string, mode: 'me' | 'both' = 'both') =>
    apiClient.delete(`/chat/conversations/${id}?mode=${mode}`),

  editMessage: (id: string, content: string, e2eKeys?: Record<string, string>) =>
    apiClient.put<Message>(`/chat/messages/${id}`, { content, e2eKeys }),

  deleteMessage: (id: string) =>
    apiClient.delete<{ success: boolean; message: Message }>(`/chat/messages/${id}`),

  getPublicKey: (userId: string) =>
    apiClient.get<{ publicKey: string }>(`/users/${userId}/e2e-key`),
};
