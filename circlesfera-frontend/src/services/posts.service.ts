import type { CreatePostDto, PaginatedResponse, Post } from '../types';
import { apiClient } from './api';

export const postsApi = {
  create: (data: CreatePostDto) => apiClient.post<Post>('posts', data),

  getAll: (page = 1, limit = 10, sort: 'latest' | 'trending' = 'latest') =>
    apiClient.get<PaginatedResponse<Post>>('posts', {
      params: { page, limit, sort },
    }),

  getFrames: (page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Post>>('posts/frames', {
      params: { page, limit },
    }),

  getByUser: (username: string, page = 1, limit = 10, type?: string) =>
    apiClient.get<PaginatedResponse<Post>>(`posts/user/${username}`, {
      params: { page, limit, type },
    }),

  getTagged: (username: string, page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Post>>(`posts/user/${username}/tagged`, {
      params: { page, limit },
    }),

  getById: (id: string) => apiClient.get<Post>(`posts/${id}`),

  update: (id: string, caption: string) =>
    apiClient.put<Post>(`/posts/${id}`, { caption }),

  delete: (id: string) => apiClient.delete(`/posts/${id}`),

  adminDelete: (id: string) => apiClient.delete(`/posts/${id}/admin`),

  getByTag: (tag: string, page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Post>>(`/posts/tags/${tag}`, {
      params: { page, limit },
    }),
};
