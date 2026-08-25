import type { PushSubscribePayload } from '../utils/pushServiceWorker';
import { apiClient } from './api';

export const pushApi = {
  getPublicKey: () =>
    apiClient.get<{ publicKey?: string | null }>('/push/public-key'),
  subscribe: (subscription: PushSubscribePayload) =>
    apiClient.post('/push/subscribe', subscription),
  unsubscribe: (endpoint: string) =>
    apiClient.delete(
      `/push/unsubscribe?endpoint=${encodeURIComponent(endpoint)}`,
    ),
};
