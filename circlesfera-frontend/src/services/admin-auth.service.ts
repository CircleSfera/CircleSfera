import { apiClient } from './api';

export type AdminMe = {
  id: string;
  email: string;
  displayName: string;
  totpEnabled: boolean;
  roles: string[];
  permissions: string[];
  lastLoginAt?: string | null;
};

// A password alone never opens a staff session: the server always asks for
// the code of the authenticator, or, with none yet, for the proof that lets
// one be set up (the link sent to the staff email, or a code from an
// administrator).
export type AdminLoginResult =
  | { status: 'MFA_REQUIRED'; mfaToken: string }
  | { status: 'ENROLMENT_PROOF_REQUIRED'; mfaToken: string };

// What the proof opens: the new authenticator, shown this once.
export type AdminEnrolResult = {
  status: 'MFA_SETUP_REQUIRED';
  mfaToken: string;
  otpauthUrl: string;
  secret: string;
  qrCodeDataUrl?: string;
};

export const adminAuthApi = {
  login: (email: string, password: string) =>
    apiClient.post<AdminLoginResult>('/admin-auth/login', { email, password }),

  enrol: (mfaToken: string, proof: string) =>
    apiClient.post<AdminEnrolResult>('/admin-auth/enrol', { mfaToken, proof }),

  verifyMfa: (mfaToken: string, code: string) =>
    apiClient.post<{ status: string }>('/admin-auth/mfa/verify', {
      mfaToken,
      code,
    }),

  me: () => apiClient.get<AdminMe>('/admin-auth/me'),

  logout: () => apiClient.post('/admin-auth/logout'),

  refresh: () => apiClient.post('/admin-auth/refresh'),

  // Confirms a sensitive action with the code of the authenticator.
  stepUp: (body: { totpCode: string }) =>
    apiClient.post('/admin-auth/step-up', body),
};
