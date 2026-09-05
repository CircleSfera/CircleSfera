import type { Collection } from '../types';
import { apiClient } from './api';

export type CollectionWritePayload = {
  name: string;
  description?: string;
};

export const collectionsApi = {
  create: (payload: CollectionWritePayload) =>
    apiClient.post<Collection>('collections', payload),

  getAll: () => apiClient.get<Collection[]>('collections'),

  getById: (id: string) => apiClient.get<Collection>(`collections/${id}`),

  update: (id: string, payload: CollectionWritePayload) =>
    apiClient.patch<Collection>(`collections/${id}`, payload),

  delete: (id: string) => apiClient.delete(`collections/${id}`),
};
