import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../services/auth.service';
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
  setCreatorMode: (active: boolean) => void;
  setAuthenticated: () => void;
  setProfile: (profile: ProfileWithUser) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      profile: null,
      isAuthenticated: false,
      isCreatorModeActive: false,
      setCreatorMode: (active) => set({ isCreatorModeActive: active }),
      setAuthenticated: () => set({ isAuthenticated: true }),
      setProfile: (profile) => set({ profile }),
      logout: async () => {
        // 1. Reset local Zustand state synchronously to prevent infinite redirect loops
        set({
          profile: null,
          isAuthenticated: false,
          isCreatorModeActive: false,
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
