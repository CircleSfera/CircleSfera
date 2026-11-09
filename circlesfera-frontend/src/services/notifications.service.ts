import type { Notification, PaginatedResponse } from '../types';
import { apiClient } from './api';

/** The filters of the activity page; the server knows the same four. */
export type NotificationKind = 'all' | 'comments' | 'follows' | 'likes';

export const notificationsApi = {
  getAll: (page = 1, limit = 10, kind: NotificationKind = 'all') =>
    apiClient.get<PaginatedResponse<Notification>>('notifications', {
      params: kind === 'all' ? { page, limit } : { page, limit, kind },
    }),

  getUnreadCount: () =>
    apiClient.get<{ count: number }>('/notifications/unread-count'),

  markAsRead: (id: string) => apiClient.put(`/notifications/${id}/read`),

  markAllAsRead: () => apiClient.put('/notifications/read-all'),
};
