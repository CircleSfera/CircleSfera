import type {
  PaginatedResponse,
  PlaceDetail,
  PlaceMapPin,
  Post,
} from '../types';
import { apiClient } from './api';

export type MapBboxParams = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  limit?: number;
};

export const placesApi = {
  getMap: (params: MapBboxParams) =>
    apiClient.get<{ data: PlaceMapPin[] }>('places/map', { params }),

  getById: (id: string) => apiClient.get<PlaceDetail>(`places/${id}`),

  getPosts: (id: string, page = 1, limit = 21) =>
    apiClient.get<PaginatedResponse<Post>>(`places/${id}/posts`, {
      params: { page, limit },
    }),
};
