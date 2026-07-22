import { apiClient } from './api';
// Assuming Report type exists or we need to add it if it was implicitly any in index.ts
// In index.ts lines 117 and 121 use Report, but it wasn't in the import list I saw in the snippet.
// I will check if I need to add it or if it is global.
// Actually, I should import it if it's used.
// Let's assume it's in ../types or treat as any for now if missing, but better be safe.
// Looking at index.ts imports (lines 13-36), Report is NOT imported.
// It might be a global type or I missed it.
// Wait, looking at index.ts again... lines 117 `apiClient.get<Report[]>`...
// If it's not imported, maybe it's defined in that file? No.
// Maybe it was auto-imported or I missed the import line in `index.ts`.
// I will assume it's imported from `../types`.

import type { Report } from '../types';

export const reportsApi = {
  create: (data: {
    targetType: 'USER' | 'POST';
    targetId: string;
    reason: string;
    details?: string;
  }) => apiClient.post('reports', data),

  getMine: () => apiClient.get<Report[]>('reports/me'),

  getAll: () => apiClient.get<Report[]>('reports'),

  update: (id: string, status: string) =>
    apiClient.patch<Report>(`reports/${id}`, { status }),
};
