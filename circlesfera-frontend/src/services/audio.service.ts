import type { Audio, PaginatedResponse, Post } from '../types';
import { apiClient } from './api';

export const audioApi = {
  search: (query: string) =>
    apiClient.get<Audio[]>(`audio/search?q=${encodeURIComponent(query)}`),

  getTrending: () => apiClient.get<Audio[]>('audio/trending'),

  getById: (id: string) => apiClient.get<Audio>(`audio/${id}`),

  // The posts and Frames that use a song, a page at a time.
  getPosts: (id: string, page = 1, limit = 21) =>
    apiClient.get<PaginatedResponse<Post>>(`audio/${id}/posts`, {
      params: { page, limit },
    }),
};
