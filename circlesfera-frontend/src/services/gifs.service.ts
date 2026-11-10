import { apiClient } from './api';

// A GIF from GIPHY, as the server gives it.
export interface ChatGif {
  id: string;
  title: string;
  url: string;
  width: number;
  height: number;
}

// The GIF picker of the chat. The server asks GIPHY; the app never does.
export const gifsApi = {
  status: () => apiClient.get<{ available: boolean }>('/gifs'),
  trending: (offset = 0) =>
    apiClient.get<{ data: ChatGif[] }>('/gifs/trending', {
      params: { offset },
    }),
  search: (q: string, offset = 0) =>
    apiClient.get<{ data: ChatGif[] }>('/gifs/search', {
      params: { q, offset },
    }),
};
