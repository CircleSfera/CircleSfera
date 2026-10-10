import type { PaginatedResponse } from '../types';
import { apiClient } from './api';

export type SupportRequestStatus =
  | 'OPEN'
  // The team asked something and waits for the reply.
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'ESCALATED';

/** A request for help, as the person who wrote it sees it. */
export interface SupportRequest {
  id: string;
  reference: number;
  subject: string;
  category: 'ACCOUNT' | 'PAYMENTS' | 'CONTENT' | 'OTHER';
  status: SupportRequestStatus;
  createdAt: string;
  updatedAt: string;
  // The closed request this one continues, when there is one.
  previousTicketId?: string | null;
}

export interface SupportRequestMessage {
  id: string;
  authorKind: 'REQUESTER' | 'AGENT' | 'SYSTEM';
  body: string;
  createdAt: string;
}

/** What the person thought of the answer. */
export interface SupportRequestRating {
  score: 'GOOD' | 'BAD';
  comment: string | null;
}

export interface SupportRequestDetail extends SupportRequest {
  messages: SupportRequestMessage[];
  rating?: SupportRequestRating | null;
}

export const supportApi = {
  // The requests of who is signed in.
  myRequests: (page = 1, limit = 20) =>
    apiClient.get<PaginatedResponse<SupportRequest>>('/support/tickets', {
      params: { page, limit },
    }),

  myRequest: (id: string) =>
    apiClient.get<SupportRequestDetail>(`/support/tickets/${id}`),

  // Whether the answer of a solved request was good or bad.
  rate: (id: string, score: 'GOOD' | 'BAD', comment?: string) =>
    apiClient.put<SupportRequestDetail>(`/support/tickets/${id}/rating`, {
      score,
      ...(comment && { comment }),
    }),

  reply: (id: string, body: string) =>
    apiClient.post<SupportRequestDetail>(`/support/tickets/${id}/messages`, {
      body,
    }),
};
