import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type AdminMe, adminAuthApi } from '../services/admin-auth.service';

interface AdminAuthState {
  admin: AdminMe | null;
  isAuthenticated: boolean;
  isSessionChecked: boolean;
  isCheckingSession: boolean;
  setAdmin: (admin: AdminMe) => void;
  setAuthenticated: () => void;
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
      setAuthenticated: () => set({ isAuthenticated: true }),
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
          // ignore
        }
        set({
          admin: null,
          isAuthenticated: false,
          isSessionChecked: true,
        });
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
