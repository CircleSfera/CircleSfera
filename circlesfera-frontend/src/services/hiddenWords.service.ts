import { apiClient } from './api';

export interface HiddenWordList {
  words: { word: string; createdAt: string }[];
  max: number;
}

// The active Profile's hidden words: comments on its posts that contain one
// are seen only by whoever wrote them.
export const hiddenWordsApi = {
  list: () => apiClient.get<HiddenWordList>('hidden-words'),
  add: (word: string) =>
    apiClient.post<{ word: string }>('hidden-words', { word }),
  remove: (word: string) =>
    apiClient.delete(`hidden-words/${encodeURIComponent(word)}`),
};
