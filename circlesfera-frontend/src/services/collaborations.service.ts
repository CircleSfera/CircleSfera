import type { Profile } from '../types';
import { apiClient } from './api';

// The collaborator of a post or Frame as its author sees it: invited and
// waiting for an answer, or accepted and shown with the post.
export interface PostCollaborator {
  status: 'PENDING' | 'ACCEPTED';
  invitedAt: string;
  respondedAt: string | null;
  profile: Profile;
}

// An invitation to co-author someone else's post, not answered yet.
export interface CollaborationInvitation {
  invitedAt: string;
  post: {
    id: string;
    type: 'POST' | 'FRAME';
    caption: string | null;
    createdAt: string;
    profile: Profile;
    media: Array<{
      type: string;
      url: string;
      thumbnailUrl: string | null;
    }>;
  };
}

export const collaborationsApi = {
  // The author's side: one collaborator per post, invited by username.
  get: (postId: string) =>
    apiClient.get<PostCollaborator | null>(`posts/${postId}/collaborator`),
  invite: (postId: string, username: string) =>
    apiClient.post<PostCollaborator>(`posts/${postId}/collaborator`, {
      username,
    }),
  remove: (postId: string) =>
    apiClient.delete<{ postId: string; collaborator: null }>(
      `posts/${postId}/collaborator`,
    ),

  // The invited Profile's side.
  invitations: () =>
    apiClient.get<CollaborationInvitation[]>('collaborations/invitations'),
  accept: (postId: string) =>
    apiClient.post<{ postId: string; status: 'ACCEPTED' }>(
      `collaborations/${postId}/accept`,
    ),
  // The collaborator pins the post on its own profile, or unpins it.
  pin: (postId: string) =>
    apiClient.post<{ postId: string; pinnedAt: string }>(
      `collaborations/${postId}/pin`,
    ),
  unpin: (postId: string) =>
    apiClient.delete<{ postId: string; pinnedAt: null }>(
      `collaborations/${postId}/pin`,
    ),
  // Declines an invitation, or stops co-authoring an accepted one.
  leave: (postId: string) =>
    apiClient.delete<{ postId: string; collaborator: null }>(
      `collaborations/${postId}`,
    ),
};
