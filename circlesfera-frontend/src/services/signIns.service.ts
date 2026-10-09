import { apiClient } from './api';

/** How one Profile of the signed-in person signs in. */
export interface ProfileSignIn {
  profileId: string;
  username: string;
  signIn: {
    id: string;
    email: string;
    emailVerified: boolean;
    // Other Profiles sign in with it too.
    shared: boolean;
    // The one this session was opened with.
    current: boolean;
  } | null;
}

export const SIGN_INS_QUERY_KEY = ['signIns'] as const;

// Both changes ask for the password the person is signed in with.
export const signInsApi = {
  list: () => apiClient.get<ProfileSignIn[]>('/sign-ins'),

  // A Profile gets an email and a password of its own.
  giveOwn: (input: {
    profileId: string;
    email: string;
    password: string;
    currentPassword: string;
  }) => apiClient.post<ProfileSignIn[]>('/sign-ins', input),

  // A Profile goes back to a sign-in it shares.
  share: (input: {
    profileId: string;
    signInId: string;
    currentPassword: string;
  }) => apiClient.post<ProfileSignIn[]>('/sign-ins/share', input),
};
