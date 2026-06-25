import { create } from 'zustand';

export type E2EStatus = 'INITIALIZING' | 'READY' | 'NEEDS_SETUP' | 'NEEDS_RECOVERY';

interface E2EState {
  status: E2EStatus;
  encryptedPrivateKeyPayload: string | null;
  setStatus: (status: E2EStatus) => void;
  setEncryptedPayload: (payload: string | null) => void;
  reset: () => void;
}

export const useE2EStore = create<E2EState>((set) => ({
  status: 'INITIALIZING',
  encryptedPrivateKeyPayload: null,
  setStatus: (status) => set({ status }),
  setEncryptedPayload: (payload) => set({ encryptedPrivateKeyPayload: payload }),
  reset: () => set({ status: 'INITIALIZING', encryptedPrivateKeyPayload: null }),
}));
