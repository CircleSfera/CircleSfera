import type { AuthResponse } from '../types';
import { apiClient } from './api';

export interface PasskeyInfo {
  id: string;
  credentialID: string;
  transports: string[];
  createdAt: string;
}

export const passkeyApi = {
  getRegistrationOptions: () => apiClient.post('auth/passkey/register-options'),

  verifyRegistration: (registrationResponse: Record<string, unknown>) =>
    apiClient.post<{ verified: boolean }>('auth/passkey/register-verify', {
      registrationResponse,
    }),

  getLoginOptions: (email: string) =>
    apiClient.post('auth/passkey/login-options', { email }),

  verifyLogin: (
    email: string,
    authenticationResponse: Record<string, unknown>,
  ) =>
    apiClient.post<AuthResponse>('auth/passkey/login-verify', {
      email,
      authenticationResponse,
    }),

  listPasskeys: () => apiClient.get<PasskeyInfo[]>('auth/passkey'),

  // Biometric or PIN confirmation required before removing a passkey.
  getStepUpOptions: () => apiClient.post('auth/passkey/step-up-options'),

  deletePasskey: (
    id: string,
    authenticationResponse: Record<string, unknown>,
  ) =>
    apiClient.delete(`auth/passkey/${id}`, {
      data: { authenticationResponse },
    }),
};
