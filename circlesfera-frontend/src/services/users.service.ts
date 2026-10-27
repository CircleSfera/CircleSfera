import type { SuggestedUser } from '../types';
import { apiClient } from './api';

export const usersApi = {
  getSuggestions: (limit = 10) =>
    apiClient.get<SuggestedUser[]>('/users/suggestions', {
      params: { limit },
    }),

  ban: (id: string) => apiClient.patch(`/users/${id}/ban`),

  unban: (id: string) => apiClient.patch(`/users/${id}/unban`),

  requestExport: () => apiClient.get<{ message: string }>('/users/gdpr/export'),

  getExportHistory: () => apiClient.get<any[]>('/users/gdpr/exports'),

  createIdentitySession: async (returnUrl: string) => {
    const response = await apiClient.post('/users/identity-session', {
      returnUrl,
    });
    return response.data;
  },

  syncIdentitySession: async () => {
    const response = await apiClient.post('/users/identity-session/sync');
    return response.data;
  },

  getSettings: () => apiClient.get('/users/me/settings'),

  // Language of the account's emails and notices.
  updateLocale: (locale: 'en' | 'es') =>
    apiClient.put<{ locale: 'en' | 'es' }>('/users/me/locale', { locale }),

  updateSettings: (data: {
    // Off pauses every push of the Profile.
    pushNotifications?: boolean;
    pushLikes?: boolean;
    pushComments?: boolean;
    pushFollows?: boolean;
    pushMessages?: boolean;
    pushLive?: boolean;
    // Whether stories are kept in the archive when their 24 hours end.
    saveStoriesToArchive?: boolean;
    emailNotifications?: boolean;
    newsletter?: boolean;
    contentPreference?: 'GENERAL' | 'MATURE';
    blurSensitiveContent?: boolean;
    isOnboarded?: boolean;
    // ISO code from the closed list; null goes back to the network's.
    country?: string | null;
  }) => apiClient.put('/users/me/settings', data),

  // Schedule account deletion (30-day GDPR grace). Canonical endpoint.
  scheduleDeletion: () =>
    apiClient.delete<{
      success: boolean;
      message: string;
      scheduled_deletion_at: string;
    }>('/users/me'),

  // Cancel scheduled deletion within the grace window.
  cancelScheduledDeletion: () =>
    apiClient.post<{ success: boolean; message: string }>('/users/me/restore'),
};
