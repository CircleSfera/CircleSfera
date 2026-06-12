import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  setAuthenticated: () => void;
  setProfile: (profile: ProfileWithUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      profile: null,
      isAuthenticated: false,
      setAuthenticated: () => set({ isAuthenticated: true }),
      setProfile: (profile) => set({ profile }),
      logout: () => {
        set({
          profile: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        profile: state.profile,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
