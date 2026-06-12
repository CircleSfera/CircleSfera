import { apiClient } from './api';

export const pushApi = {
  getPublicKey: () => apiClient.get('/push/public-key'),
  subscribe: (subscription: any) =>
    apiClient.post('/push/subscribe', subscription),
  unsubscribe: (endpoint: string) =>
    apiClient.delete(
      `/push/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`,
    ),
};
