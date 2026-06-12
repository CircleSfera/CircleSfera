import type { AuthResponse, LoginDto, RegisterDto } from '../types';
import { apiClient } from './api';

export const authApi = {
  register: (data: RegisterDto) =>
    apiClient.post<AuthResponse>('/auth/register', data),

  login: (data: LoginDto) => apiClient.post<AuthResponse>('/auth/login', data),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),

  verifyEmail: (token: string) =>
    apiClient.post('/auth/verify-email', { token }),

  requestReset: (email: string) =>
    apiClient.post('/auth/request-reset', { email }),

  resetPassword: (data: { token: string; newPassword: string }) =>
    apiClient.post('/auth/reset-password', data),
};
