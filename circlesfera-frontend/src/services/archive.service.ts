import { apiClient } from './api';

// A post or frame its author archived: shown to them only, in their
// archive, with its likes and comments, until they show it on their profile
// again.
export interface ArchivedPost {
  kind: 'POST' | 'FRAME';
  id: string;
  createdAt: string;
  archivedAt: string;
  caption: string | null;
  mediaType: 'image' | 'video';
  url: string;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  mediaCount: number;
  likesCount: number;
  commentsCount: number;
}

export interface ArchivePage {
  items: ArchivedPost[];
  nextCursor: string | null;
}

export const archiveApi = {
  // Newest archived first; the next page starts after the cursor.
  listPosts: (type: 'POST' | 'FRAME', cursor?: string) =>
    apiClient.get<ArchivePage>('users/me/archive/posts', {
      params: { type, cursor },
    }),

  archive: (id: string) =>
    apiClient.post<{ id: string; archivedAt: string }>(`posts/${id}/archive`),

  // Back on the profile, in its place.
  unarchive: (id: string) =>
    apiClient.post<{ id: string }>(`posts/${id}/unarchive`),
};
