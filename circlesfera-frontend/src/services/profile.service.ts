import type { ProfileWithUser, UpdateProfileDto } from '../types';
import { apiClient } from './api';

export type ProfileAccountType = 'PERSONAL' | 'CREATOR' | 'BUSINESS';

// One Profile of the signed-in account, as listed by /profiles/my-profiles.
export interface OwnedProfile {
  id: string;
  username: string;
  fullName: string | null;
  avatar: string | null;
  thumbnailUrl?: string | null;
  standardUrl?: string | null;
  accountType: ProfileAccountType;
  isAccountBanned: boolean;
  isSuspended: boolean;
  suspendedUntil: string | null;
  _count?: { posts: number; followers: number; following: number };
}

// Profiles per account, enforced by the backend.
export const MAX_PROFILES_PER_ACCOUNT = 5;

export const profileApi = {
  getMyProfile: () => apiClient.get<ProfileWithUser>('profiles/me'),

  getMyReferrals: () => apiClient.get<any>('profiles/me/referrals'),

  getProfile: (username: string) =>
    apiClient.get<ProfileWithUser>(`/profiles/${username}`),

  checkUsername: (username: string) =>
    apiClient.get<{ available: boolean; message: string }>(
      `/profiles/check-username/${username}`,
    ),

  updateProfile: (data: UpdateProfileDto) =>
    apiClient.put<ProfileWithUser>('/profiles/me', data),

  getMyProfiles: () => apiClient.get<OwnedProfile[]>('/profiles/my-profiles'),

  createProfile: (data: {
    username: string;
    fullName?: string;
    bio?: string;
    avatar?: string;
    website?: string | null;
    location?: string | null;
    accountType?: ProfileAccountType;
  }) => apiClient.post<OwnedProfile>('/profiles', data),

  switchProfile: (profileId: string) =>
    apiClient.post<{ message: string; profile: any }>(
      `/profiles/switch/${profileId}`,
    ),

  deactivateAccount: () => apiClient.post('/profiles/me/deactivate'),

  deleteAccount: () => apiClient.delete('/profiles/me'),
};
