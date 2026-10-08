import type { PaginatedResponse } from '../types';
import { apiClient } from './api';

export type SupportRequestStatus = 'OPEN' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';

/** A request for help, as the person who wrote it sees it. */
export interface SupportRequest {
  id: string;
  reference: number;
  subject: string;
  category: 'ACCOUNT' | 'PAYMENTS' | 'CONTENT' | 'OTHER';
  status: SupportRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SupportRequestMessage {
  id: string;
  authorKind: 'REQUESTER' | 'AGENT' | 'SYSTEM';
  body: string;
  createdAt: string;
}

export interface SupportRequestDetail extends SupportRequest {
  messages: SupportRequestMessage[];
}

export const supportApi = {
  // The requests of who is signed in.
  myRequests: (page = 1, limit = 20) =>
    apiClient.get<PaginatedResponse<SupportRequest>>('/support/tickets', {
      params: { page, limit },
    }),

  myRequest: (id: string) =>
    apiClient.get<SupportRequestDetail>(`/support/tickets/${id}`),

  reply: (id: string, body: string) =>
    apiClient.post<SupportRequestDetail>(`/support/tickets/${id}/messages`, {
      body,
    }),
};
