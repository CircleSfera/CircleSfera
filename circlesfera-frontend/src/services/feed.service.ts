import type { PaginatedResponse, Post } from '../types';
import { apiClient } from './api';

export const feedApi = {
  getForYou: (page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Post>>('feed/foryou', {
      params: { page, limit },
    }),

  getFollowing: (page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Post>>('feed/following', {
      params: { page, limit },
    }),
};
