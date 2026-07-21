import { apiClient as api } from './api';

export const liveApi = {
  getActiveStreams: async () => {
    const response = await api.get('/live/active');
    return response.data;
  },
};
