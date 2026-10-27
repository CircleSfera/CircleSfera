import { apiClient } from './api';

// A post, frame or story its author deleted, kept 30 days in Recently
// deleted, where only its author sees it and can restore it.
export interface RecentlyDeletedItem {
  kind: 'POST' | 'FRAME' | 'STORY';
  id: string;
  deletedAt: string;
  createdAt: string;
  // Whole days before it is deleted for good.
  daysLeft: number;
  caption: string | null;
  mediaType: 'image' | 'video';
  url: string;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  mediaCount: number;
}

export const recentlyDeletedApi = {
  list: () =>
    apiClient.get<{ items: RecentlyDeletedItem[] }>(
      'users/me/recently-deleted',
    ),

  restorePost: (id: string) =>
    apiClient.post<{ id: string; kind: 'POST' | 'FRAME' }>(
      `posts/${id}/restore`,
    ),

  // A story whose 24 hours are over comes back to the story archive.
  restoreStory: (id: string) =>
    apiClient.post<{ id: string; archived: boolean }>(`stories/${id}/restore`),

  deletePostForGood: (id: string) => apiClient.delete(`posts/${id}/permanent`),

  deleteStoryForGood: (id: string) =>
    apiClient.delete(`stories/${id}/permanent`),
};
