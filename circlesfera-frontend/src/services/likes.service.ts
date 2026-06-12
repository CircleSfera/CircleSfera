import { apiClient } from './api';

export const likesApi = {
  toggle: (postId: string) =>
    apiClient.post<{ liked: boolean }>(`/posts/${postId}/likes/toggle`),

  check: (postId: string) =>
    apiClient.get<{ liked: boolean }>(`/posts/${postId}/likes/check`),
};
