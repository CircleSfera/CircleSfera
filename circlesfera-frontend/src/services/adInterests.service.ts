import type { AdInterestsStatus, AdInterestTopic } from '@circlesfera/shared';
import { apiClient } from './api';

// The interests the person chooses for their ads (PD-084). The server checks
// the set (topics of the list, never `other`, at most the most) and stores
// none for someone under 18 or without a date of birth.
export const adInterestsApi = {
  status: () =>
    apiClient
      .get<AdInterestsStatus>('users/me/ad-interests')
      .then((response) => response.data),
  // The whole set, replacing the one stored; an empty set clears it.
  choose: (topics: AdInterestTopic[]) =>
    apiClient
      .put<AdInterestsStatus>('users/me/ad-interests', { topics })
      .then((response) => response.data),
};

export const AD_INTERESTS_QUERY_KEY = ['ad-interests'] as const;
