import type { Notification, PaginatedResponse } from '../types';
import { apiClient } from './api';

export const notificationsApi = {
  getAll: (page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Notification>>('notifications', {
      params: { page, limit },
    }),

  getUnreadCount: () =>
    apiClient.get<{ count: number }>('/notifications/unread-count'),

  markAsRead: (id: string) => apiClient.put(`/notifications/${id}/read`),

  markAllAsRead: () => apiClient.put('/notifications/read-all'),
};
