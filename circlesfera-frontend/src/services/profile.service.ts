import type { ProfileWithUser, UpdateProfileDto } from '../types';
import { apiClient } from './api';

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

  getMyProfiles: () => apiClient.get<any[]>('/profiles/my-profiles'),

  createProfile: (data: {
    username: string;
    fullName?: string;
    bio?: string;
    avatar?: string;
    website?: string | null;
    location?: string | null;
    accountType?: 'PERSONAL' | 'CREATOR' | 'BUSINESS';
  }) => apiClient.post<any>('/profiles', data),

  switchProfile: (profileId: string) =>
    apiClient.post<{ message: string; profile: any }>(
      `/profiles/switch/${profileId}`,
    ),

  deactivateAccount: () => apiClient.post('/profiles/me/deactivate'),

  deleteAccount: () => apiClient.delete('/profiles/me'),
};
