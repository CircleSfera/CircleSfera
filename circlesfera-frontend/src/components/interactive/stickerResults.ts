import { apiClient } from '../../services/api';

/** What the routes of stickers answer for a quiz or a slider. */
export interface StickerResults {
  id: string;
  kind: string;
  settings: {
    question?: string;
    prompt?: string;
    options?: string[];
    correctIndex?: number;
    emoji?: string;
    /** A countdown: its title and when it ends. */
    title?: string;
    endsAt?: string;
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
  /** For the story's author: who voted or slid, most recent first. */
  responders?: StickerResponder[];
  /** For the story's author: the answers to a question. */
  answers?: {
    id: string;
    text: string;
    createdAt: string;
    profile: ResponderProfile;
  }[];
}

export interface ResponderProfile {
  id: string;
  username: string;
  fullName: string | null;
  avatar: string | null;
}

export interface StickerResponder {
  optionIndex: number | null;
  value: number | null;
  createdAt: string;
  profile: ResponderProfile;
}

export const readSticker = (stickerId: string) =>
  apiClient
    .get<StickerResults>(`stories/stickers/${stickerId}`)
    .then((r) => r.data);

export const answerSticker = (
  stickerId: string,
  body: { optionIndex?: number; value?: number; remind?: boolean },
) =>
  apiClient
    .post<StickerResults>(`stories/stickers/${stickerId}/responses`, body)
    .then((r) => r.data);
