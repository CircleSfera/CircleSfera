import { apiClient } from './api';

export type TeamRole = 'ADMINISTRATOR' | 'EDITOR';
export type TeamMemberStatus = 'INVITED' | 'ACTIVE' | 'PAUSED';

export interface TeamPerson {
  id: string;
  username: string;
  fullName: string | null;
  avatar: string | null;
}

export interface TeamMember {
  id: string;
  role: TeamRole;
  status: TeamMemberStatus;
  createdAt: string;
  acceptedAt: string | null;
  person: TeamPerson | null;
}

// The team of the Profile in use, for its owner.
export interface Team {
  available: boolean;
  seats: { used: number; max: number };
  members: TeamMember[];
}

// An invitation waiting for the person.
export interface TeamInvitation {
  id: string;
  role: TeamRole;
  createdAt: string;
  profile: TeamPerson;
}

// A Business Profile the person works on as a member, for the switcher.
export interface TeamProfile {
  id: string;
  username: string;
  fullName: string | null;
  avatar: string | null;
  accountType: string;
  memberRole: TeamRole;
}

export type TeamActivityAction =
  | 'POST_PUBLISHED'
  | 'POST_EDITED'
  | 'POST_DELETED'
  | 'STORY_PUBLISHED'
  | 'STORY_DELETED'
  | 'COMMENT_WRITTEN'
  | 'COMMENT_EDITED'
  | 'COMMENT_DELETED'
  | 'PROFILE_EDITED';

// One thing done on the Profile, for its owner.
export interface TeamActivityEntry {
  id: string;
  action: TeamActivityAction;
  targetId: string | null;
  createdAt: string;
  byOwner: boolean;
  person: TeamPerson | null;
}

export interface TeamActivityPage {
  data: TeamActivityEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const teamApi = {
  activity: (page = 1) =>
    apiClient
      .get<TeamActivityPage>('team/activity', { params: { page, limit: 20 } })
      .then((r) => r.data),
  profiles: () =>
    apiClient.get<TeamProfile[]>('team/profiles').then((r) => r.data),
  get: () => apiClient.get<Team>('team').then((r) => r.data),
  invite: (username: string, role: TeamRole) =>
    apiClient.post('team/members', { username, role }).then((r) => r.data),
  remove: (memberId: string) =>
    apiClient.delete(`team/members/${memberId}`).then((r) => r.data),
  invitations: () =>
    apiClient.get<TeamInvitation[]>('team/invitations').then((r) => r.data),
  // A member accepted while the Business plan is off starts paused.
  accept: (id: string) =>
    apiClient
      .post<{ success: boolean; paused?: boolean }>(
        `team/invitations/${id}/accept`,
      )
      .then((r) => r.data),
  decline: (id: string) =>
    apiClient.post(`team/invitations/${id}/decline`).then((r) => r.data),
};
