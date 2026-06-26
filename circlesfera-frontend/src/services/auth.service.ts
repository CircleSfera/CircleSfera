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

  requestReset: (email: string) =>
    apiClient.post('/auth/request-reset', { email }),

  resetPassword: (data: { token: string; newPassword: string }) =>
    apiClient.post('/auth/reset-password', data),

  generate2fa: () =>
    apiClient.post<{ secret: string; qrCodeDataUrl: string }>(
      '/auth/2fa/generate',
    ),

  verify2fa: (data: { code: string }) =>
    apiClient.post<{ isValid: boolean }>('/auth/2fa/verify', data),

  enable2fa: (data: { code: string }) =>
    apiClient.post<{ success: boolean }>('/auth/2fa/enable', data),

  disable2fa: () => apiClient.post<{ success: boolean }>('/auth/2fa/disable'),
};
