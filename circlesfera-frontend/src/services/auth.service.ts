import type { AuthResponse, LoginDto, RegisterDto } from '../types';
import { apiClient } from './api';

export const authApi = {
  register: (data: RegisterDto) =>
    apiClient.post<AuthResponse>('/auth/register', data),

  login: (data: LoginDto) => apiClient.post<AuthResponse>('/auth/login', data),

  logout: (refreshToken?: string) =>
    apiClient.post('/auth/logout', refreshToken ? { refreshToken } : {}),

  verifyEmail: (token: string) =>
    apiClient.post('/auth/verify-email', { token }),

  resendVerification: () =>
    apiClient.post<{ message: string }>('/auth/resend-verification'),

  requestReset: (email: string) =>
    apiClient.post('/auth/request-reset', { email }),

  resetPassword: (data: { token: string; newPassword: string }) =>
    apiClient.post('/auth/reset-password', data),

  generate2fa: () => apiClient.post<{ qrCodeDataUrl: string }>('/2fa/generate'),

  // Turning two-factor on or off takes a current code of the authenticator
  // app, under the name the server reads it by.
  enable2fa: (data: { code: string }) =>
    apiClient.post<{ message: string }>('/2fa/turn-on', {
      twoFactorAuthenticationCode: data.code,
    }),

  disable2fa: (data: { code: string }) =>
    apiClient.post<{ message: string }>('/2fa/turn-off', {
      twoFactorAuthenticationCode: data.code,
    }),

  getSessions: () =>
    apiClient.get<
      Array<{
        id: string;
        userAgent?: string;
        ipAddress?: string;
        createdAt: string;
        expiresAt: string;
      }>
    >('/auth/sessions'),

  revokeSession: (id: string) => apiClient.delete(`/auth/sessions/${id}`),

  revokeOtherSessions: () => apiClient.delete('/auth/sessions/other'),
};
