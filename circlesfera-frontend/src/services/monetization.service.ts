import { api } from './index';

export const monetizationApi = {
  getStatus: async () => {
    const { data } = await api.get('/monetization/status');
    return data;
  },
  connectAccount: async (returnUrl: string, refreshUrl: string) => {
    const { data } = await api.post('/monetization/connect', {
      returnUrl,
      refreshUrl,
    });
    return data;
  },
  getDashboardLink: async () => {
    const { data } = await api.get('/monetization/dashboard');
    return data;
  },
  sendTip: async (
    receiverId: string,
    amountCents: number,
    returnUrl: string,
    postId?: string,
  ) => {
    const { data } = await api.post('/monetization/tip', {
      receiverId,
      amountCents,
      returnUrl,
      postId,
    });
    return data;
  },
  unlockPost: async (postId: string, returnUrl: string) => {
    const { data } = await api.post('/monetization/unlock', {
      postId,
      returnUrl,
    });
    return data;
  },

  unlockStory: async (storyId: string, returnUrl: string) => {
    const { data } = await api.post('/monetization/unlock-story', {
      storyId,
      returnUrl,
    });
    return data;
  },
  getTransactions: async (page = 1, limit = 20) => {
    const { data } = await api.get('/monetization/transactions', {
      params: { page, limit },
    });
    return data;
  },
  getMonetization: async () => {
    const { data } = await api.get('/monetization');
    return data;
  },
};
