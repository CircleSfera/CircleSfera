import type { PaginatedResponse, Post } from '../types';
import { apiClient } from './api';

export const feedApi = {
  // asOf (DATA-003): pass back the asOf from page 1's response on
  // subsequent pages so the "for you" ranking snapshot stays frozen for
  // the scroll session instead of recomputing against a moving NOW().
  getForYou: (page = 1, limit = 10, asOf?: string) =>
    apiClient.get<PaginatedResponse<Post>>('feed/foryou', {
      params: { page, limit, asOf },
    }),

  getFollowing: (page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Post>>('feed/following', {
      params: { page, limit },
    }),
};
