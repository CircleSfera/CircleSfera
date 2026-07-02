import { create } from 'zustand';

export type E2EStatus =
  | 'INITIALIZING'
  | 'READY'
  | 'NEEDS_SETUP'
  | 'NEEDS_RECOVERY'
  | 'SYNCING';

interface E2EState {
  status: E2EStatus;
  encryptedPrivateKeyPayload: string | null;
  syncKeyPair: CryptoKeyPair | null;
  setStatus: (status: E2EStatus) => void;
  setEncryptedPayload: (payload: string | null) => void;
  setSyncKeyPair: (keyPair: CryptoKeyPair | null) => void;
  reset: () => void;
}

export const useE2EStore = create<E2EState>((set) => ({
  status: 'INITIALIZING',
  encryptedPrivateKeyPayload: null,
  syncKeyPair: null,
  setStatus: (status) => set({ status }),
  setEncryptedPayload: (payload) =>
    set({ encryptedPrivateKeyPayload: payload }),
  setSyncKeyPair: (syncKeyPair) => set({ syncKeyPair }),
  reset: () =>
    set({
      status: 'INITIALIZING',
      encryptedPrivateKeyPayload: null,
      syncKeyPair: null,
    }),
}));
