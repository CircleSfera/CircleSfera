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

  // The author of the post pins a comment, so it is shown first.
  pin: (postId: string, commentId: string) =>
    apiClient.post(`posts/${postId}/comments/${commentId}/pin`),

  unpin: (postId: string, commentId: string) =>
    apiClient.delete(`posts/${postId}/comments/${commentId}/pin`),

  // The author's: comments of the post hidden by their hidden words.
  hidden: (postId: string) =>
    apiClient.get<{ data: Comment[] }>(`posts/${postId}/comments/hidden`),

  showHidden: (postId: string, commentId: string) =>
    apiClient.post(`posts/${postId}/comments/${commentId}/show`),
};
