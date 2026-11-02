import type { CreatePostDto, PaginatedResponse, Post } from '../types';
import { apiClient } from './api';

export type PostWhyReason =
  | { code: 'own' }
  | { code: 'following'; username: string }
  | { code: 'close_friend'; username: string }
  | { code: 'engaged_with_author'; username: string }
  | { code: 'liked_similar_tags'; tags: string[] }
  | { code: 'similar_content' }
  | { code: 'popular' }
  | { code: 'new' }
  | { code: 'promoted'; username: string; countries: string[] };

export interface PostWhy {
  reasons: PostWhyReason[];
}

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

  // Why the post is shown to the viewer: the reasons the server finds true.
  getWhy: (id: string) => apiClient.get<PostWhy>(`posts/${id}/why`),

  // The caption and, for a frame, the moment of its video used as the cover.
  // The media itself cannot be changed.
  update: (id: string, caption: string, coverTimeMs?: number) =>
    apiClient.put<Post>(`/posts/${id}`, {
      caption,
      ...(coverTimeMs !== undefined && { coverTimeMs }),
    }),

  delete: (id: string) => apiClient.delete(`/posts/${id}`),

  adminDelete: (id: string) => apiClient.delete(`/posts/${id}/admin`),

  getByTag: (tag: string, page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Post>>(`/posts/tags/${tag}`, {
      params: { page, limit },
    }),
};
