import { apiClient as api } from './api';

export const liveApi = {
  getActiveStreams: async () => {
    const response = await api.get('/live/active');
    return response.data;
  },

  getStream: async (streamId: string) => {
    const response = await api.get(`/live/${streamId}`);
    return response.data;
  },

  inviteCoHost: async (streamId: string, coHostUserId: string) => {
    const response = await api.post(`/live/${streamId}/cohost/invite`, { coHostUserId });
    return response.data;
  },

  acceptCoHostInvite: async (streamId: string) => {
    const response = await api.post(`/live/${streamId}/cohost/accept`);
    return response.data;
  },

  removeCoHost: async (streamId: string) => {
    const response = await api.delete(`/live/${streamId}/cohost`);
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
