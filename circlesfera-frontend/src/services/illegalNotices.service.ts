import { apiClient } from './api';

export type IllegalNoticeStatus = 'RECEIVED' | 'ACTIONED' | 'NO_ACTION';

export interface IllegalNotice {
  id: string;
  contentUrl: string;
  explanation: string;
  childAbuse: boolean;
  notifierName: string | null;
  notifierEmail: string | null;
  status: IllegalNoticeStatus;
  decision: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface IllegalNoticePage {
  items: IllegalNotice[];
  nextCursor: string | null;
}

export const illegalNoticesApi = {
  // From anyone, with or without a session.
  create: (notice: {
    contentUrl: string;
    explanation: string;
    childAbuse: boolean;
    notifierName?: string;
    notifierEmail?: string;
    goodFaith: true;
    locale?: 'en' | 'es';
    captchaToken?: string;
  }) =>
    apiClient.post<{ reference: string }>('/illegal-content-notices', notice),

  // Staff with the reports permission: one tab a page at a time, most
  // recent first.
  page: (status: IllegalNoticeStatus, cursor?: string) =>
    apiClient.get<IllegalNoticePage>('admin/illegal-content-notices/page', {
      params: cursor ? { status, cursor } : { status },
    }),

  decide: (id: string, outcome: 'ACTIONED' | 'NO_ACTION', reasons: string) =>
    apiClient.post<IllegalNotice>(
      `admin/illegal-content-notices/${id}/decide`,
      {
        outcome,
        reasons,
      },
    ),
};
