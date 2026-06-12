import type { Comment, CreateCommentDto, PaginatedResponse } from '../types';
import { apiClient } from './api';

export const commentsApi = {
  create: (postId: string, data: CreateCommentDto) =>
    apiClient.post<Comment>(`posts/${postId}/comments`, data),

  getByPost: (postId: string, page = 1, limit = 10) =>
    apiClient.get<PaginatedResponse<Comment>>(`posts/${postId}/comments`, {
      params: { page, limit },
    }),

  delete: (postId: string, commentId: string) =>
    apiClient.delete(`posts/${postId}/comments/${commentId}`),

  like: (postId: string, commentId: string) =>
    apiClient.post(`posts/${postId}/comments/${commentId}/like`),

  unlike: (postId: string, commentId: string) =>
    apiClient.delete(`posts/${postId}/comments/${commentId}/like`),
};
