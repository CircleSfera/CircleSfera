import type { UserWithProfile } from '../types';
import { apiClient } from './api';

export const closeFriendsApi = {
  getCloseFriends: () => apiClient.get<UserWithProfile[]>('close-friends'),

  toggleCloseFriend: (friendId: string) =>
    apiClient.post<{ isCloseFriend: boolean }>(`close-friends/${friendId}`),
};
