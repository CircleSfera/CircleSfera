import type { ProfileWithUser } from '../types';
import { apiClient } from './api';

export type MuteDuration = '24h' | '7d' | '30d' | 'forever';

export type MutedUserEntry = {
  createdAt: string;
  expiresAt: string | null;
  profile: ProfileWithUser;
};

// Cursor pagination response shape — pass `nextCursor` back as
// `cursor` to fetch the next page; absent/undefined means no further pages.
export interface KeysetPage<T> {
  data: T[];
  nextCursor?: string;
}

export const followsApi = {
  toggle: (username: string) =>
    apiClient.post<{ following: boolean; status: string }>(
      `users/${username}/follow/toggle`,
    ),

  check: (username: string) =>
    apiClient.get<{ following: boolean; status: string }>(
      `users/${username}/follow/check`,
    ),

  getFollowers: (username: string, cursor?: string, limit = 20) =>
    apiClient.get<KeysetPage<ProfileWithUser>>(
      `users/${username}/follow/followers`,
      { params: { cursor, limit } },
    ),

  getFollowing: (username: string, cursor?: string, limit = 20) =>
    apiClient.get<KeysetPage<ProfileWithUser>>(
      `users/${username}/follow/following`,
      { params: { cursor, limit } },
    ),

  block: (username: string) => apiClient.post(`users/${username}/follow/block`),

  unblock: (username: string) =>
    apiClient.post(`users/${username}/follow/unblock`),

  getBlocked: () => apiClient.get<ProfileWithUser[]>('users/me/follow/blocked'),

  mute: (username: string, duration: MuteDuration = 'forever') =>
    apiClient.post<{ success: boolean; expiresAt: string | null }>(
      `users/${username}/follow/mute`,
      { duration },
    ),

  unmute: (username: string) =>
    apiClient.post(`users/${username}/follow/unmute`),

  getMuted: () => apiClient.get<MutedUserEntry[]>('users/me/follow/muted'),

  // Restrict: their new comments on your posts wait for your approval, their
  // chat goes to your requests, and they stop seeing when you are active or
  // have read their messages. They are never told.
  restrict: (username: string) =>
    apiClient.post<{ restricted: boolean }>(
      `users/${username}/follow/restrict`,
    ),

  unrestrict: (username: string) =>
    apiClient.post<{ restricted: boolean }>(
      `users/${username}/follow/unrestrict`,
    ),

  restriction: (username: string) =>
    apiClient.get<{ restricted: boolean }>(
      `users/${username}/follow/restriction`,
    ),

  getRestricted: () =>
    apiClient.get<ProfileWithUser[]>('users/me/follow/restricted'),

  // Pending follow requests
  getPending: () => apiClient.get<ProfileWithUser[]>('users/me/follow/pending'),

  acceptRequest: (username: string) =>
    apiClient.post<{ success: boolean }>(`users/${username}/follow/accept`),

  rejectRequest: (username: string) =>
    apiClient.post<{ success: boolean }>(`users/${username}/follow/reject`),
};
