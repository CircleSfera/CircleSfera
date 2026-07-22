import { apiClient as api } from './api';

export const liveApi = {
  getActiveStreams: async () => {
    const response = await api.get('/live/active');
    return response.data;
  },

  sendGift: async (streamId: string, giftId: string, price: number) => {
    const response = await api.post(`/live/${streamId}/gift`, {
      giftId,
      price,
    });
    return response.data;
  },
};
