import { apiClient } from './api';

export type AdminMe = {
  id: string;
  email: string;
  displayName: string;
  totpEnabled: boolean;
  mfaRequired: boolean;
  roles: string[];
  permissions: string[];
  lastLoginAt?: string | null;
};

export type AdminLoginResult =
  | { status: 'OK'; message?: string }
  | { status: 'MFA_REQUIRED'; mfaToken: string }
  | {
      status: 'MFA_SETUP_REQUIRED';
      mfaToken: string;
      otpauthUrl: string;
      secret: string;
      qrCodeDataUrl?: string;
    };

export const adminAuthApi = {
  login: (email: string, password: string) =>
    apiClient.post<AdminLoginResult>('/admin-auth/login', { email, password }),

  verifyMfa: (mfaToken: string, code: string) =>
    apiClient.post<{ status: string }>('/admin-auth/mfa/verify', {
      mfaToken,
      code,
    }),

  me: () => apiClient.get<AdminMe>('/admin-auth/me'),

  logout: () => apiClient.post('/admin-auth/logout'),

  refresh: () => apiClient.post('/admin-auth/refresh'),

  stepUp: (body: { password?: string; totpCode?: string }) =>
    apiClient.post('/admin-auth/step-up', body),
};
