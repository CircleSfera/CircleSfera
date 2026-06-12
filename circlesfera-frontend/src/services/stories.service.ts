import type { CreateStoryDto, Story, UserWithProfile } from '../types';
import { apiClient } from './api';

export const storiesApi = {
  create: (data: CreateStoryDto) => apiClient.post<Story>('stories', data),

  getAll: () => apiClient.get('stories'),

  getByUser: (username: string) =>
    apiClient.get<Story[]>(`stories/user/${username}`),

  getArchive: () => apiClient.get<Story[]>('stories/archive'),

  markViewed: (id: string) => apiClient.post(`stories/${id}/view`),

  getViews: (id: string) =>
    apiClient.get<UserWithProfile[]>(`stories/${id}/views`),

  addReaction: (id: string, reaction: string) =>
    apiClient.post(`stories/${id}/react`, { reaction }),

  getReactions: (id: string) =>
    apiClient.get<
      { reaction: string; userId: string; user: UserWithProfile }[]
    >(`stories/${id}/reactions`),

  delete: (id: string) => apiClient.delete(`stories/${id}`),
};
