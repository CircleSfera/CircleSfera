import type { PaginatedResponse } from '../types';
import { apiClient } from './api';

// The review area of the staff sites: what an external reviewer (a payment
// provider) reads, read only. Creators are named by public username; no
// one's email, address, message or note is in any answer.

export interface ReviewSummary {
  days: number;
  paidPostsOnSale: number;
  paidStoriesOnSale: number;
  chargingAccounts: number;
  payments: Array<{
    type: string;
    status: string;
    count: number;
    amountCents: number;
    refundedCents: number;
  }>;
  disputes: Record<string, number>;
  reports: Record<string, number>;
  strikes: Record<string, number>;
  appeals: Record<string, number>;
  illegalContentNotices: Record<string, number>;
}

export interface ReviewCreatorRef {
  username: string;
  accountType: string;
  verificationLevel: string;
}

export interface ReviewPaidItem {
  id: string;
  kind: 'post' | 'story';
  postType?: string;
  createdAt: string;
  expiresAt?: string;
  caption?: string | null;
  priceCents: number;
  moderationStatus: string;
  audience: string;
  media: Array<{ url: string; thumbnailUrl: string | null; type: string }>;
  creator: ReviewCreatorRef;
  sales: number;
}

export interface ReviewCreator extends ReviewCreatorRef {
  createdAt: string;
  standing: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  paidPostsOnSale: number;
  activeStrikes: number;
  completedPayments: number;
  grossCents: number;
}

export interface ReviewReport {
  id: string;
  createdAt: string;
  reason: string;
  targetType: string;
  status: string;
  urgent: boolean;
  resolvedAt: string | null;
}

export interface ReviewStrike {
  id: string;
  createdAt: string;
  kind: string;
  reason: string;
  consequence: string;
  expiresAt: string;
  revokedAt: string | null;
  username: string;
}

export interface ReviewAppeal {
  id: string;
  createdAt: string;
  targetType: string;
  status: string;
  resolvedAt: string | null;
}

export interface ReviewNotice {
  id: string;
  createdAt: string;
  childAbuse: boolean;
  status: string;
  decidedAt: string | null;
}

export type ReviewEnforcementKind =
  | 'reports'
  | 'strikes'
  | 'appeals'
  | 'notices';

export type ReviewEnforcementRow = {
  reports: ReviewReport;
  strikes: ReviewStrike;
  appeals: ReviewAppeal;
  notices: ReviewNotice;
};

type Page = { page?: number; limit?: number };

export const reviewApi = {
  summary: () => apiClient.get<ReviewSummary>('admin/review/summary'),

  paidContent: (params: Page & { kind: 'post' | 'story' }) =>
    apiClient.get<PaginatedResponse<ReviewPaidItem>>(
      'admin/review/paid-content',
      { params },
    ),

  creators: (params: Page) =>
    apiClient.get<PaginatedResponse<ReviewCreator>>('admin/review/creators', {
      params,
    }),

  enforcement: <K extends ReviewEnforcementKind>(params: Page & { kind: K }) =>
    apiClient.get<PaginatedResponse<ReviewEnforcementRow[K]>>(
      'admin/review/enforcement',
      { params },
    ),
};
