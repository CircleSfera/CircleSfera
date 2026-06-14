import type { Profile } from '../types';
import { apiClient } from './api';

export const followsApi = {
  toggle: (username: string) =>
    apiClient.post<{ following: boolean; status: string }>(
      `users/${username}/follow/toggle`,
    ),

  check: (username: string) =>
    apiClient.get<{ following: boolean; status: string }>(
      `users/${username}/follow/check`,
    ),

  getFollowers: (username: string) =>
    apiClient.get(`users/${username}/follow/followers`),

  getFollowing: (username: string) =>
    apiClient.get(`users/${username}/follow/following`),

  block: (username: string) => apiClient.post(`users/${username}/follow/block`),

  unblock: (username: string) =>
    apiClient.post(`users/${username}/follow/unblock`),

  getBlocked: () =>
    apiClient.get<{ id: string; profile?: Profile }[]>(
      'users/me/follow/blocked',
    ),

  mute: (username: string) => apiClient.post(`users/${username}/follow/mute`),

  unmute: (username: string) =>
    apiClient.post(`users/${username}/follow/unmute`),

  getMuted: () =>
    apiClient.get<{ id: string; profile?: Profile }[]>('users/me/follow/muted'),

  // Pending follow requests
  getPending: () =>
    apiClient.get<{ id: string; profile?: Profile }[]>(
      'users/me/follow/pending',
    ),

  acceptRequest: (username: string) =>
    apiClient.post<{ success: boolean }>(`users/${username}/follow/accept`),

  rejectRequest: (username: string) =>
    apiClient.post<{ success: boolean }>(`users/${username}/follow/reject`),
};
