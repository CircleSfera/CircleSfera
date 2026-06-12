import type { PaginatedResponse, Post } from '../types';
import { apiClient } from './api';

export const bookmarksApi = {
  toggle: (postId: string, collectionId?: string) =>
    apiClient.post<{ bookmarked: boolean; collectionId?: string }>(
      `bookmarks/${postId}/toggle`,
      { collectionId },
    ),

  updateCollection: (postId: string, collectionId: string | null) =>
    apiClient.post<{ bookmarked: boolean; collectionId?: string | null }>(
      `bookmarks/${postId}/collection`,
      { collectionId },
    ),

  check: (postId: string) =>
    apiClient.get<{ bookmarked: boolean }>(`bookmarks/${postId}/check`),

  getAll: (page = 1, limit = 10, collectionId?: string) =>
    apiClient.get<PaginatedResponse<Post>>('bookmarks', {
      params: { page, limit, collectionId },
    }),
};
