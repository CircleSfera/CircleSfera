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
    const response = await api.post(`/live/${streamId}/cohost/invite`, {
      coHostUserId,
    });
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

  /** Starts Stripe Checkout for a catalog gift; returns { url, liveGiftId, amountCents }. */
  sendGift: async (streamId: string, giftId: string, returnUrl?: string) => {
    const response = await api.post(`/live/${streamId}/gift`, {
      giftId,
      returnUrl: returnUrl || window.location.href,
    });
    return response.data as {
      url: string;
      liveGiftId: string;
      giftId: string;
      amountCents: number;
    };
  },
};
