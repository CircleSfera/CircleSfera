import type { Audio } from '../types';
import { apiClient } from './api';

export const audioApi = {
  search: (query: string) => apiClient.get<Audio[]>(`audio/search?q=${query}`),

  getTrending: () => apiClient.get<Audio[]>('audio/trending'),

  getById: (id: string) => apiClient.get<Audio>(`audio/${id}`),
};
