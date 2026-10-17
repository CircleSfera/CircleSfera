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

export const teamApi = {
  get: () => apiClient.get<Team>('team').then((r) => r.data),
  invite: (username: string, role: TeamRole) =>
    apiClient.post('team/members', { username, role }).then((r) => r.data),
  remove: (memberId: string) =>
    apiClient.delete(`team/members/${memberId}`).then((r) => r.data),
  invitations: () =>
    apiClient.get<TeamInvitation[]>('team/invitations').then((r) => r.data),
  accept: (id: string) =>
    apiClient.post(`team/invitations/${id}/accept`).then((r) => r.data),
  decline: (id: string) =>
    apiClient.post(`team/invitations/${id}/decline`).then((r) => r.data),
};
