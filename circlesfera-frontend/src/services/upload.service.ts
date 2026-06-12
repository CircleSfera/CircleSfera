import { apiClient } from './api';

export const uploadApi = {
  upload: (formData: FormData) =>
    apiClient.post<{ url: string; type: string }>('/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};
