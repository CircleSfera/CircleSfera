import { apiClient } from './api';

export interface DataExportRequest {
  id: string;
  userId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  expiresAt: string | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
}

export const requestDataExport = async (): Promise<DataExportRequest> => {
  const response = await apiClient.get('/users/gdpr/export');
  return response.data;
};

export const getLatestDataExport = async (): Promise<DataExportRequest> => {
  const response = await apiClient.get('/users/gdpr/exports');

  return response.data[0];
};
