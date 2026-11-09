import { apiClient } from './api';

export type PostTagStatus = 'SHOWN' | 'PENDING';

export interface MyPostTag {
  createdAt: string;
  status: PostTagStatus;
  // False for a post the Profile cannot open: the row then carries only
  // what removing the tag needs.
  canOpen: boolean;
  post: {
    id: string;
    caption: string | null;
    createdAt: string;
    // None for a paid post: the tag is not a way into it.
    thumbnailUrl: string | null;
    profile: {
      id: string;
      username: string;
      avatar?: string | null;
      thumbnailUrl?: string | null;
      standardUrl?: string | null;
    } | null;
  };
}

// The active Profile's own tags on others' posts.
export const postTagsApi = {
  list: (status: PostTagStatus) =>
    apiClient.get<{ data: MyPostTag[] }>('post-tags', { params: { status } }),

  // Shows on the profile a tag that was waiting for approval.
  approve: (postId: string) => apiClient.post(`post-tags/${postId}/approve`),

  // Takes the Profile off the post's tags.
  remove: (postId: string) => apiClient.delete(`post-tags/${postId}`),
};
