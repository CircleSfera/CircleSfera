import { create } from 'zustand';

interface UIState {
  isCreateMenuOpen: boolean;
  editedMediaForPost: File | null;
  openCreateMenu: () => void;
  closeCreateMenu: () => void;
  toggleCreateMenu: () => void;
  setEditedMediaForPost: (file: File | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isCreateMenuOpen: false,
  editedMediaForPost: null,
  openCreateMenu: () => set({ isCreateMenuOpen: true }),
  closeCreateMenu: () => set({ isCreateMenuOpen: false }),
  toggleCreateMenu: () =>
    set((state) => ({ isCreateMenuOpen: !state.isCreateMenuOpen })),
  setEditedMediaForPost: (file) => set({ editedMediaForPost: file }),
}));
