import { create } from 'zustand';

export type EditedMediaHandoff = {
  file: File;
  scheduledAt?: string;
  /**
   * A song of the library already mixed into the video: published with the
   * post so it counts as used, while the video keeps its own sound.
   */
  songInVideo?: { id: string; startMs: number };
};

interface UIState {
  isCreateMenuOpen: boolean;
  isCreateHighlightOpen: boolean;
  editedMediaForPost: EditedMediaHandoff | null;
  openCreateMenu: () => void;
  closeCreateMenu: () => void;
  toggleCreateMenu: () => void;
  openCreateHighlight: () => void;
  closeCreateHighlight: () => void;
  setEditedMediaForPost: (payload: EditedMediaHandoff | File | null) => void;
}

function normalizeHandoff(
  payload: EditedMediaHandoff | File | null,
): EditedMediaHandoff | null {
  if (!payload) return null;
  if (payload instanceof File) return { file: payload };
  return payload;
}

export const useUIStore = create<UIState>((set) => ({
  isCreateMenuOpen: false,
  isCreateHighlightOpen: false,
  editedMediaForPost: null,
  openCreateMenu: () => set({ isCreateMenuOpen: true }),
  closeCreateMenu: () => set({ isCreateMenuOpen: false }),
  toggleCreateMenu: () =>
    set((state) => ({ isCreateMenuOpen: !state.isCreateMenuOpen })),
  openCreateHighlight: () =>
    set({ isCreateMenuOpen: false, isCreateHighlightOpen: true }),
  closeCreateHighlight: () => set({ isCreateHighlightOpen: false }),
  setEditedMediaForPost: (payload) =>
    set({ editedMediaForPost: normalizeHandoff(payload) }),
}));
