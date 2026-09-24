import type {
  CreateStoryDto,
  ProfileWithUser,
  Story,
  UserWithProfile,
} from '../types';
import { apiClient } from './api';
import type { KeysetPage } from './follows.service';

export const storiesApi = {
  create: (data: CreateStoryDto) => apiClient.post<Story>('stories', data),

  getAll: () => apiClient.get('stories'),

  getByUser: (username: string) =>
    apiClient.get<Story[]>(`stories/user/${username}`),

  getArchive: () => apiClient.get<Story[]>('stories/archive'),

  markViewed: (id: string) => apiClient.post(`stories/${id}/view`),

  getViews: (id: string, cursor?: string, limit = 50) =>
    apiClient.get<KeysetPage<UserWithProfile>>(`stories/${id}/views`, {
      params: { cursor, limit },
    }),

  addReaction: (id: string, reaction: string) =>
    apiClient.post(`stories/${id}/react`, { reaction }),

  getReactions: (id: string, cursor?: string, limit = 50) =>
    apiClient.get<
      KeysetPage<{
        reaction: string;
        profileId: string;
        profile?: ProfileWithUser;
      }>
    >(`stories/${id}/reactions`, { params: { cursor, limit } }),

  delete: (id: string) => apiClient.delete(`stories/${id}`),
};
