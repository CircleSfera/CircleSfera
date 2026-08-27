import type { ProfileWithUser } from '../types';
import { apiClient } from './api';

export const closeFriendsApi = {
  getCloseFriends: () => apiClient.get<ProfileWithUser[]>('close-friends'),

  toggleCloseFriend: (friendId: string) =>
    apiClient.post<{ isCloseFriend: boolean }>(`close-friends/${friendId}`),
};
