import type { Highlight, Story } from '../types';
import { apiClient } from './api';

export const highlightsApi = {
  create: (data: { title: string; coverUrl?: string; storyIds: string[] }) =>
    apiClient.post<Highlight>('highlights', data),

  getProfileHighlights: (profileId: string) =>
    apiClient.get<Highlight[]>(`highlights/profile/${profileId}`),

  /** @deprecated Use getProfileHighlights */
  getUserHighlights: (profileId: string) =>
    apiClient.get<Highlight[]>(`highlights/profile/${profileId}`),

  getOne: (id: string) =>
    apiClient.get<Highlight & { stories: { story: Story }[] }>(
      `highlights/${id}`,
    ),

  update: (
    id: string,
    data: { title?: string; coverUrl?: string; storyIds?: string[] },
  ) => apiClient.patch<Highlight>(`highlights/${id}`, data),

  delete: (id: string) => apiClient.delete(`highlights/${id}`),
};
