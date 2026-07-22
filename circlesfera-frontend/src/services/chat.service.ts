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
    voiceUrl?: string;
    voiceDuration?: number;
    voiceWaveform?: number[];
  }) => apiClient.post<Message>('/chat/messages', data),

  markAsRead: (conversationId: string) =>
    apiClient.put(`/chat/conversations/${conversationId}/read`),

  createGroup: (data: { participantIds: string[]; name?: string }) =>
    apiClient.post<Conversation>('/chat/conversations', data),

  deleteConversation: (id: string, mode: 'me' | 'both' = 'both') =>
    apiClient.delete(`/chat/conversations/${id}?mode=${mode}`),

  updateGroup: (id: string, data: { name?: string; avatarUrl?: string }) =>
    apiClient.put<Conversation>(`/chat/conversations/${id}/group`, data),

  removeParticipant: (id: string, userId: string) =>
    apiClient.delete<Conversation>(
      `/chat/conversations/${id}/participants/${userId}`,
    ),

  leaveGroup: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/chat/conversations/${id}/leave`),

  editMessage: (id: string, content: string) =>
    apiClient.put<Message>(`/chat/messages/${id}`, { content }),

  deleteMessage: (id: string) =>
    apiClient.delete<{ success: boolean; message: Message }>(
      `/chat/messages/${id}`,
    ),
};
