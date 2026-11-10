import type { Profile } from '../types';
import { apiClient } from './api';

export type FavoriteProfile = Profile & { addedAt: string };

// The signed-in Profile's Favorites: Profiles it follows whose posts make its
// Favorites feed. Private: nobody is told.
export const favoritesApi = {
  list: () => apiClient.get<FavoriteProfile[]>('favorites'),

  add: (profileId: string) =>
    apiClient.post<{ favoriteId: string; isFavorite: boolean }>(
      `favorites/${profileId}`,
    ),

  remove: (profileId: string) =>
    apiClient.delete<{ favoriteId: string; isFavorite: boolean }>(
      `favorites/${profileId}`,
    ),
};
