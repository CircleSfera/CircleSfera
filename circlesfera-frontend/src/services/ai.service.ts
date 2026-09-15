import { apiClient } from './api';

export const aiApi = {
  generateAltText: (imageUrl: string) =>
    apiClient.post<{ text: string }>('/ai/alt-text', { imageUrl }),
};
