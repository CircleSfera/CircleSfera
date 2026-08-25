import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SecurityState {
  isBiometricEnabled: boolean;
  isLocked: boolean;
  setBiometricEnabled: (enabled: boolean) => void;
  setLocked: (locked: boolean) => void;
}

export const useSecurityStore = create<SecurityState>()(
  persist(
    (set) => ({
      isBiometricEnabled: false,
      isLocked: false,
      setBiometricEnabled: (enabled: boolean) => {
        // If they enable biometrics, we immediately lock it to force them to prove identity
        set({ isBiometricEnabled: enabled, isLocked: enabled });
      },
      setLocked: (locked: boolean) => set({ isLocked: locked }),
    }),
    {
      name: 'circlesfera-security-storage',
      // We only want to persist whether biometrics is enabled.
      // We DO NOT persist `isLocked` because we want it to be true on cold start if enabled.
      // We will handle cold start locking in AppLockScreen/App.
      partialize: (state) => ({ isBiometricEnabled: state.isBiometricEnabled }),
    },
  ),
);
