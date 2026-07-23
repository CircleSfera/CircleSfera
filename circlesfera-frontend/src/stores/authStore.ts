import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../services/auth.service';
import { profileApi } from '../services/profile.service';
import type { ProfileWithUser } from '../types';

/**
 * Auth state store.
 *
 * Tokens are NO LONGER stored in this store or localStorage.
 * They live exclusively in HTTP-only cookies managed by the backend.
 * This store only tracks the current user profile and authentication status.
 */
interface AuthState {
  profile: ProfileWithUser | null;
  isAuthenticated: boolean;
  isCreatorModeActive: boolean;
  /** Whether the persisted session has been validated against the backend this app load. */
  isSessionChecked: boolean;
  /** Whether a session validation request is currently in flight (dedupe guard). */
  isCheckingSession: boolean;
  setCreatorMode: (active: boolean) => void;
  setAuthenticated: () => void;
  setProfile: (profile: ProfileWithUser) => void;
  logout: () => Promise<void>;
  /**
   * Validates the locally-persisted auth state against the backend by
   * fetching the current profile. Persisted `isAuthenticated`/`profile`
   * can be stale (e.g. the HTTP-only session cookie expired while the
   * app was closed), so this must run once per app load before trusting
   * them for protected routes.
   *
   * Safe to call multiple times: it no-ops while a check is already in
   * flight or once it has already completed for this app load.
   */
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      profile: null,
      isAuthenticated: false,
      isCreatorModeActive: false,
      isSessionChecked: false,
      isCheckingSession: false,
      setCreatorMode: (active) => set({ isCreatorModeActive: active }),
      setAuthenticated: () => set({ isAuthenticated: true }),
      setProfile: (profile) => set({ profile }),
      checkSession: async () => {
        const state = get();
        if (state.isSessionChecked || state.isCheckingSession) return;

        // Nothing was persisted as "logged in" — there is no session to validate.
        if (!state.isAuthenticated) {
          set({ isSessionChecked: true });
          return;
        }

        set({ isCheckingSession: true });
        try {
          const { data } = await profileApi.getMyProfile();
          set({
            profile: data,
            isAuthenticated: true,
            isSessionChecked: true,
            isCheckingSession: false,
          });
        } catch {
          // Session cookie is missing/expired (401) or backend unreachable.
          // Clear local auth state so guards stop treating the user as logged in.
          // No backend logout call here: the session is already invalid, and
          // the apiClient's own 401 interceptor already handles revocation
          // for requests made elsewhere in the app.
          set({
            profile: null,
            isAuthenticated: false,
            isSessionChecked: true,
            isCheckingSession: false,
          });
        }
      },
      logout: async () => {
        // 1. Reset local Zustand state synchronously to prevent infinite redirect loops
        set({
          profile: null,
          isAuthenticated: false,
          isCreatorModeActive: false,
          isSessionChecked: true,
          isCheckingSession: false,
        });

        try {
          // 2. Tell backend to revoke session cookies
          await authApi.logout();
        } catch (error) {
          console.error('Failed to logout from backend', error);
        }

        // 3. Clear Service Worker API cache to prevent cross-account data bleed
        if ('caches' in window) {
          try {
            await caches.delete('api-cache');
          } catch (e) {
            console.error('Failed to clear api-cache', e);
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        profile: state.profile,
        isAuthenticated: state.isAuthenticated,
        isCreatorModeActive: state.isCreatorModeActive,
      }),
    },
  ),
);
