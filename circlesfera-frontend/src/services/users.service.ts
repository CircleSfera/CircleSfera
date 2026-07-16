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
};
