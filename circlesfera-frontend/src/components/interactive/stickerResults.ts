import { apiClient } from '../../services/api';

/** What the routes of stickers answer for a quiz or a slider. */
export interface StickerResults {
  id: string;
  kind: string;
  settings: {
    question?: string;
    options?: string[];
    correctIndex?: number;
    emoji?: string;
  };
  totalResponses: number;
  myResponse: { optionIndex: number | null; value: number | null } | null;
  options?: {
    index: number;
    text: string;
    votes: number;
    percentage: number;
  }[];
  average?: number | null;
}

export const readSticker = (stickerId: string) =>
  apiClient
    .get<StickerResults>(`stories/stickers/${stickerId}`)
    .then((r) => r.data);

export const answerSticker = (
  stickerId: string,
  body: { optionIndex?: number; value?: number },
) =>
  apiClient
    .post<StickerResults>(`stories/stickers/${stickerId}/responses`, body)
    .then((r) => r.data);
