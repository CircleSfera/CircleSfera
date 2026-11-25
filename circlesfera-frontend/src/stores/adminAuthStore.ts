import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type AdminMe, adminAuthApi } from '../services/admin-auth.service';

interface AdminAuthState {
  admin: AdminMe | null;
  isAuthenticated: boolean;
  isSessionChecked: boolean;
  isCheckingSession: boolean;
  setAdmin: (admin: AdminMe) => void;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  hasPermission: (key: string) => boolean;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      admin: null,
      isAuthenticated: false,
      isSessionChecked: false,
      isCheckingSession: false,
      setAdmin: (admin) => set({ admin, isAuthenticated: true }),
      checkSession: async () => {
        const state = get();
        if (state.isSessionChecked || state.isCheckingSession) return;

        set({ isCheckingSession: true });
        try {
          const { data } = await adminAuthApi.me();
          set({
            admin: data,
            isAuthenticated: true,
            isSessionChecked: true,
            isCheckingSession: false,
          });
        } catch {
          set({
            admin: null,
            isAuthenticated: false,
            isSessionChecked: true,
            isCheckingSession: false,
          });
        }
      },
      logout: async () => {
        try {
          await adminAuthApi.logout();
        } catch {
          // Signed out here even when the server cannot be reached.
        }
        set({
          admin: null,
          isAuthenticated: false,
          isSessionChecked: true,
        });
        // The panel loads again from its sign-in page, as the app does after
        // a participant signs out: the query cache and every in-memory store
        // hold what this staff member was shown, and none of it may reach
        // whoever signs in next on this tab. Already on that page, nothing is
        // left to drop, and loading it again would only repeat the check.
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      },
      hasPermission: (key: string) => {
        const admin = get().admin;
        if (!admin) return false;
        if (admin.roles.includes('SUPER_ADMIN')) return true;
        if (admin.permissions.includes('admins.manage')) return true;
        return admin.permissions.includes(key);
      },
    }),
    {
      name: 'circlesfera-admin-auth',
      partialize: (state) => ({
        admin: state.admin,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

if (typeof window !== 'undefined') {
  window.addEventListener('auth:admin_unauthorized', () => {
    void useAdminAuthStore.getState().logout();
  });
}
