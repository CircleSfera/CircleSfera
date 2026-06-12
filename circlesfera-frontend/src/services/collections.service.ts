import type { Collection } from '../types';
import { apiClient } from './api';

export const collectionsApi = {
  create: (name: string) => apiClient.post<Collection>('collections', { name }),

  getAll: () => apiClient.get<Collection[]>('collections'),

  getById: (id: string) => apiClient.get<Collection>(`collections/${id}`),

  update: (id: string, name: string) =>
    apiClient.patch<Collection>(`collections/${id}`, { name }),

  delete: (id: string) => apiClient.delete(`collections/${id}`),
};
