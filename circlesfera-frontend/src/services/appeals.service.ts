import type { PaginatedResponse } from '../types';
import { apiClient } from './api';

export type AppealTargetType = 'ACCOUNT_BAN' | 'POST_REMOVAL';
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
  user?: {
    id: string;
    email: string;
    profile: {
      username: string;
      fullName: string | null;
      avatarUrl: string | null;
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
