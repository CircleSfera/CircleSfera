import { apiClient } from './api';

export type AdminMe = {
  id: string;
  email: string;
  displayName: string;
  totpEnabled: boolean;
  // False while the identity still signs in the old way, with the password
  // of its CircleSfera account: the staff sites ask it to set its own.
  ownPassword?: boolean;
  // How many staff passkeys the identity has; the staff sites ask a member
  // of staff with none to add one.
  passkeyCount?: number;
  roles: string[];
  permissions: string[];
  lastLoginAt?: string | null;
  // An external reviewer (a payment provider): reads the review area only,
  // until the end of their access.
  externalReviewer?: boolean;
  accessExpiresAt?: string | null;
};

// A password alone never opens a member of staff's session: the server asks
// for the code of the authenticator, or, with none yet, for the proof that
// lets one be set up (the link sent to the staff email, or a code from an
// administrator). An external reviewer is the one exception: signed in at
// once, the session already in its cookies.
export type AdminLoginResult =
  | { status: 'MFA_REQUIRED'; mfaToken: string }
  | { status: 'ENROLMENT_PROOF_REQUIRED'; mfaToken: string }
  | { status: 'SIGNED_IN' };

// What the proof opens: the new authenticator, shown this once.
export type AdminEnrolResult = {
  status: 'MFA_SETUP_REQUIRED';
  mfaToken: string;
  otpauthUrl: string;
  secret: string;
  qrCodeDataUrl?: string;
};

// What setting up the access answers: a member of staff's new authenticator,
// or, for an external reviewer, a session already in its cookies.
export type AdminAccessResult = AdminEnrolResult | { status: 'SIGNED_IN' };

// A staff passkey as listed: never its key.
export type AdminPasskey = {
  id: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export const adminAuthApi = {
  login: (email: string, password: string) =>
    apiClient.post<AdminLoginResult>('/admin-auth/login', { email, password }),

  enrol: (mfaToken: string, proof: string) =>
    apiClient.post<AdminEnrolResult>('/admin-auth/enrol', { mfaToken, proof }),

  // Sets up the access from the link sent to the staff email, or a code from
  // an administrator, with a password of one's own.
  setUpAccess: (email: string, proof: string, password: string) =>
    apiClient.post<AdminAccessResult>('/admin-auth/access', {
      email,
      proof,
      password,
    }),

  // Changes the password of the identity signed in, or sets its own for the
  // first time; a member of staff also gives a code of its authenticator.
  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    totpCode?: string;
  }) => apiClient.post<{ status: string }>('/admin-auth/password', body),

  // Staff passkeys: sign-in (any staff passkey of the device), and the
  // identity's own list. Adding or removing one asks for a fresh code.
  passkeyLoginOptions: () =>
    apiClient.post<Record<string, unknown>>(
      '/admin-auth/passkeys/login/options',
    ),
  passkeyLogin: (response: Record<string, unknown>) =>
    apiClient.post<{ status: 'SIGNED_IN' }>('/admin-auth/passkeys/login', {
      response,
    }),
  listPasskeys: () => apiClient.get<AdminPasskey[]>('/admin-auth/passkeys'),
  passkeyRegisterOptions: () =>
    apiClient.post<Record<string, unknown>>(
      '/admin-auth/passkeys/register/options',
    ),
  registerPasskey: (response: Record<string, unknown>, name?: string) =>
    apiClient.post<{ id: string }>('/admin-auth/passkeys/register', {
      response,
      ...(name ? { name } : {}),
    }),
  removePasskey: (id: string) =>
    apiClient.delete(`/admin-auth/passkeys/${encodeURIComponent(id)}`),

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
