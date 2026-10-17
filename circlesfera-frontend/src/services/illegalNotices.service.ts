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

  // Staff with the reports permission.
  list: (status?: IllegalNoticeStatus) =>
    apiClient.get<IllegalNotice[]>('admin/illegal-content-notices', {
      params: status ? { status } : undefined,
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
