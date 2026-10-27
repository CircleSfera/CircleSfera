import type { Conversation, Message } from '../types';
import { apiClient } from './api';

// A page of the conversation list as the server sends it.
export interface ConversationPage {
  items: Conversation[];
  nextCursor: string | null;
}

export const chatApi = {
  getConversations: (folder?: 'inbox' | 'requests') =>
    apiClient.get<Conversation[]>(
      folder ? `/chat/conversations?folder=${folder}` : '/chat/conversations',
    ),

  // One page of the list; the cursor is the nextCursor of the page before.
  getConversationPage: (folder: 'inbox' | 'requests', cursor?: string | null) =>
    apiClient.get<ConversationPage>('/chat/conversations/page', {
      params: { folder, ...(cursor ? { cursor } : {}) },
    }),

  getConversation: (id: string) =>
    apiClient.get<Conversation>(`/chat/conversations/${id}`),

  acceptRequest: (conversationId: string) =>
    apiClient.post<{ success: boolean }>(
      `/chat/conversations/${conversationId}/accept`,
    ),

  declineRequest: (conversationId: string) =>
    apiClient.post<{ success: boolean }>(
      `/chat/conversations/${conversationId}/decline`,
    ),

  getUnreadCount: () =>
    apiClient.get<{ count: number }>('/chat/conversations/unread-count'),

  // The latest messages, oldest first; with `before`, the ones sent before
  // that message (its time and id).
  getMessages: (
    conversationId: string,
    before?: { createdAt: string; id: string },
  ) =>
    before
      ? apiClient.get<Message[]>(
          `/chat/conversations/${conversationId}/messages`,
          { params: { before: before.createdAt, beforeId: before.id } },
        )
      : apiClient.get<Message[]>(
          `/chat/conversations/${conversationId}/messages`,
        ),

  sendMessage: (data: {
    recipientId?: string;
    content: string;
    mediaUrl?: string;
    mediaType?: string;
    conversationId?: string;
    tempId?: string;
    postId?: string;
    storyId?: string;
    replyToId?: string;
    voiceUrl?: string;
    voiceDuration?: number;
    voiceWaveform?: number[];
    isLocked?: boolean;
    priceCents?: number;
  }) => apiClient.post<Message>('/chat/messages', data),

  markAsRead: (conversationId: string) =>
    apiClient.put(`/chat/conversations/${conversationId}/read`),

  createGroup: (data: { participantIds: string[]; name?: string }) =>
    apiClient.post<Conversation>('/chat/conversations', data),

  // In a group it is leaving it; an admin may name who becomes admin after.
  deleteConversation: (id: string, mode: 'me' = 'me', successorId?: string) =>
    successorId
      ? apiClient.delete(`/chat/conversations/${id}?mode=${mode}`, {
          params: { successorId },
        })
      : apiClient.delete(`/chat/conversations/${id}?mode=${mode}`),

  updateGroup: (
    id: string,
    data: { name?: string; avatarUrl?: string | null },
  ) => apiClient.put<Conversation>(`/chat/conversations/${id}/group`, data),

  removeParticipant: (id: string, userId: string) =>
    apiClient.delete<Conversation>(
      `/chat/conversations/${id}/participants/${userId}`,
    ),

  // An admin may name the member who becomes admin after them; both happen
  // together, or neither does.
  leaveGroup: (id: string, successorId?: string) =>
    successorId
      ? apiClient.delete<{ success: boolean }>(
          `/chat/conversations/${id}/leave`,
          { params: { successorId } },
        )
      : apiClient.delete<{ success: boolean }>(
          `/chat/conversations/${id}/leave`,
        ),

  // An admin makes another member of the group admin.
  makeAdmin: (id: string, profileId: string) =>
    apiClient.put<Conversation>(
      `/chat/conversations/${id}/participants/${profileId}/admin`,
    ),

  editMessage: (id: string, content: string) =>
    apiClient.put<Message>(`/chat/messages/${id}`, { content }),

  deleteMessage: (id: string) =>
    apiClient.delete<{ success: boolean; message: Message }>(
      `/chat/messages/${id}`,
    ),
};
