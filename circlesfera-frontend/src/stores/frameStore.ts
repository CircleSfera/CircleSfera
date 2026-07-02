import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FrameState {
  isMuted: boolean;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
}

export const useFrameStore = create<FrameState>()(
  persist(
    (set) => ({
      isMuted: true, // Auto-play policies generally require muted initially
      toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
      setMuted: (muted) => set({ isMuted: muted }),
    }),
    {
      name: 'frame-storage',
    },
  ),
);
