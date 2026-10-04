import type { PaginatedResponse } from '../types';
import { apiClient } from './api';

export type AppealTargetType =
  | 'ACCOUNT_BAN'
  | 'POST_REMOVAL'
  | 'BOT_LABEL'
  | 'STRIKE';
export type AppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Appeal {
  id: string;
  userId: string;
  targetType: AppealTargetType;
  targetId: string | null;
  reason: string;
  status: AppealStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  targetPreview?: {
    text?: string | null;
    moderationStatus?: string | null;
    type?: string;
  } | null;
  user?: {
    id: string;
    email: string;
    isActive?: boolean;
    suspendedUntil?: string | null;
    profile: {
      username: string;
      fullName: string | null;
      avatar: string | null;
    } | null;
  };
}

export const createAppeal = async (data: {
  targetType: AppealTargetType;
  targetId?: string;
  reason: string;
}): Promise<Appeal> => {
  const response = await apiClient.post<Appeal>('/appeals', data);
  return response.data;
};

export const getMyAppeals = async (): Promise<Appeal[]> => {
  const response = await apiClient.get<Appeal[]>('/appeals/my-appeals');
  return response.data;
};

export const getAdminAppeals = async (
  page = 1,
  limit = 20,
  status?: AppealStatus,
): Promise<PaginatedResponse<Appeal>> => {
  const response = await apiClient.get<PaginatedResponse<Appeal>>(
    '/appeals/admin',
    { params: { page, limit, status } },
  );
  return response.data;
};

export const updateAdminAppeal = async (
  id: string,
  data: { status: AppealStatus; adminNotes?: string },
): Promise<Appeal> => {
  const response = await apiClient.patch<Appeal>(`/appeals/admin/${id}`, data);
  return response.data;
};

export type ProfileStrikeKind = 'WARNING' | 'STRIKE';
export type ProfileStrikeConsequence = 'NONE' | 'SUSPENDED' | 'BANNED';
export type ProfileStrikeStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export type ProfileStrikeReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'ILLEGAL_CONTENT'
  | 'VIOLENCE'
  | 'HATE_SPEECH'
  | 'IMPERSONATION'
  | 'CSAM'
  | 'SCAM'
  | 'OTHER';

// A warning or strike on the Profile the session acts as.
export interface ProfileStrike {
  id: string;
  kind: ProfileStrikeKind;
  reason: ProfileStrikeReason;
  consequence: ProfileStrikeConsequence;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: ProfileStrikeStatus;
}

export const getMyStrikes = async (): Promise<ProfileStrike[]> => {
  const response = await apiClient.get<ProfileStrike[]>('/strikes/me');
  return response.data;
};
