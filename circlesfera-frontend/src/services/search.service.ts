import type { Post, Profile, SearchHistoryItem, SearchResult } from '../types';
import { apiClient } from './api';

export const searchApi = {
  search: (query: string) => apiClient.get<SearchResult>(`search?q=${query}`),

  searchUsers: (query: string) =>
    apiClient.get<Profile[]>(`search/users?q=${query}`),

  searchPosts: (query: string) =>
    apiClient.get<Post[]>(`search/posts?q=${query}`),

  searchSemantic: (query: string) =>
    apiClient.get<Post[]>(`search/ai?q=${query}`),

  getTrending: (limit = 10) =>
    apiClient.get<Post[]>(`search/trending?limit=${limit}`),

  getHistory: () => apiClient.get<SearchHistoryItem[]>('search/history'),

  clearHistory: () => apiClient.delete('search/history'),
};
