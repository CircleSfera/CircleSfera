import { create } from 'zustand';
import type {
  AspectRatioType,
  Clip,
  StudioProject,
  StudioTab,
  Track,
} from '../types/studio';
import { resolutionForAspect } from '../utils/studioExportHelpers';

interface StudioState {
  project: StudioProject | null;
  cloudProjectId: string | null;
  playhead: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  zoom: number;
  activeTab: StudioTab;
  openSheet: StudioTab | 'properties' | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';

  past: StudioProject[];
  future: StudioProject[];

  setProject: (project: StudioProject) => void;
  setProjectName: (name: string) => void;
  setCloudProjectId: (id: string | null) => void;
  setPlayhead: (time: number) => void;
  togglePlayback: () => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  selectClip: (clipId: string | null) => void;
  setActiveTab: (tab: StudioTab) => void;
  setOpenSheet: (sheet: StudioTab | 'properties' | null) => void;
  setAspectRatio: (aspectRatio: AspectRatioType) => void;
  setSaveStatus: (status: StudioState['saveStatus']) => void;

  beginHistoryTransaction: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  addTrack: (track: Track) => void;
  removeTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackHidden: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  addClip: (trackId: string, clip: Clip) => void;
  updateClip: (
    clipId: string,
    updates: Partial<Clip>,
    options?: { history?: boolean },
  ) => void;
  removeClip: (clipId: string) => void;
  splitClip: () => void;

  calculateDuration: () => void;
}

const pushHistory = (state: StudioState, newProject: StudioProject) => {
  if (!state.project) return { project: newProject };
  return {
    past: [...state.past.slice(-20), state.project],
    future: [],
    project: newProject,
    canUndo: true,
    canRedo: false,
  };
};

export const useStudioStore = create<StudioState>((set) => ({
  project: null,
  cloudProjectId: null,
  playhead: 0,
  isPlaying: false,
  selectedClipId: null,
  zoom: 50,
  activeTab: 'media',
  openSheet: null,
  saveStatus: 'idle',

  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  setProject: (project) =>
    set({
      project,
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    }),

  setProjectName: (name) =>
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          name,
          updatedAt: new Date().toISOString(),
        },
      };
    }),

  setCloudProjectId: (id) => set({ cloudProjectId: id }),

  setPlayhead: (time) => set({ playhead: Math.max(0, time) }),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setPlaying: (playing) => set({ isPlaying: playing }),

  setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(200, zoom)) }),

  selectClip: (clipId) =>
    set({
      selectedClipId: clipId,
      openSheet: clipId ? 'properties' : null,
    }),

  setActiveTab: (tab) => set({ activeTab: tab, openSheet: tab }),

  setOpenSheet: (sheet) => set({ openSheet: sheet }),

  setAspectRatio: (aspectRatio) =>
    set((state) => {
      if (!state.project) return state;
      const updated = {
        ...state.project,
        aspectRatio,
        resolution: resolutionForAspect(aspectRatio),
      };
      return pushHistory(state, updated);
    }),

  setSaveStatus: (saveStatus) => set({ saveStatus }),

  beginHistoryTransaction: () =>
    set((state) => {
      if (!state.project) return state;
      return {
        past: [...state.past.slice(-20), state.project],
        future: [],
        canUndo: true,
        canRedo: false,
      };
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0 || !state.project) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      return {
        past: newPast,
        future: [state.project, ...state.future],
        project: previous,
        canUndo: newPast.length > 0,
        canRedo: true,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0 || !state.project) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      return {
        past: [...state.past, state.project],
        future: newFuture,
        project: next,
        canUndo: true,
        canRedo: newFuture.length > 0,
      };
    }),

  addTrack: (track) =>
    set((state) => {
      if (!state.project) return state;
      const updated = {
        ...state.project,
        tracks: [...state.project.tracks, track],
      };
      return pushHistory(state, updated);
    }),

  removeTrack: (trackId) =>
    set((state) => {
      if (!state.project) return state;
      const track = state.project.tracks.find((t) => t.id === trackId);
      const selectedOnTrack = track?.clips.some(
        (c) => c.id === state.selectedClipId,
      );
      const updated = {
        ...state.project,
        tracks: state.project.tracks.filter((t) => t.id !== trackId),
      };
      const historyResult = pushHistory(state, updated);
      return {
        ...historyResult,
        selectedClipId: selectedOnTrack ? null : state.selectedClipId,
        openSheet: selectedOnTrack ? null : state.openSheet,
      };
    }),

  toggleTrackMute: (trackId) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t,
      );
      return pushHistory(state, { ...state.project, tracks });
    }),

  toggleTrackHidden: (trackId) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) =>
        t.id === trackId ? { ...t, hidden: !t.hidden } : t,
      );
      return pushHistory(state, { ...state.project, tracks });
    }),

  toggleTrackLock: (trackId) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) =>
        t.id === trackId ? { ...t, locked: !t.locked } : t,
      );
      return pushHistory(state, { ...state.project, tracks });
    }),

  addClip: (trackId, clip) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) => {
        if (t.id === trackId) {
          return { ...t, clips: [...t.clips, clip] };
        }
        return t;
      });

      const maxEnd = Math.max(
        ...tracks.flatMap((t) => t.clips.map((c) => c.startAt + c.duration)),
        state.project.duration,
      );

      const updated = { ...state.project, tracks, duration: maxEnd };
      return pushHistory(state, updated);
    }),

  updateClip: (clipId, updates, options) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? ({ ...c, ...updates } as Clip) : c,
        ),
      }));
      const updated = { ...state.project, tracks };
      if (options?.history) {
        return pushHistory(state, updated);
      }
      return { project: updated };
    }),

  removeClip: (clipId) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      }));
      const updated = { ...state.project, tracks };
      const historyResult = pushHistory(state, updated);
      return {
        ...historyResult,
        selectedClipId:
          state.selectedClipId === clipId ? null : state.selectedClipId,
        openSheet: state.selectedClipId === clipId ? null : state.openSheet,
      };
    }),

  splitClip: () =>
    set((state) => {
      if (!state.project || !state.selectedClipId) return state;

      const { playhead, selectedClipId } = state;

      let targetTrack: Track | undefined;
      let targetClip: Clip | undefined;

      for (const t of state.project.tracks) {
        const c = t.clips.find((clip) => clip.id === selectedClipId);
        if (c) {
          targetTrack = t;
          targetClip = c;
          break;
        }
      }

      if (!targetTrack || !targetClip) return state;

      const clipEnd = targetClip.startAt + targetClip.duration;
      if (playhead <= targetClip.startAt || playhead >= clipEnd) {
        return state;
      }

      const relativeSplit = playhead - targetClip.startAt;

      const generateId = () =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2);

      const newClip: Clip = {
        ...targetClip,
        id: generateId(),
        startAt: playhead,
        duration: targetClip.duration - relativeSplit,
      };

      if (targetClip.type !== 'text') {
        const speed = (targetClip as { speed?: number }).speed ?? 1;
        (newClip as typeof targetClip & { mediaStart: number }).mediaStart =
          (targetClip as { mediaStart: number }).mediaStart +
          relativeSplit * speed;
      }

      const updatedTracks = state.project.tracks.map((t) => {
        if (t.id === targetTrack!.id) {
          const updatedClips = t.clips.map((c) => {
            if (c.id === targetClip!.id) {
              return { ...c, duration: relativeSplit } as Clip;
            }
            return c;
          });
          updatedClips.push(newClip);
          return { ...t, clips: updatedClips };
        }
        return t;
      });

      const updatedProject = { ...state.project, tracks: updatedTracks };
      return pushHistory(state, updatedProject);
    }),

  calculateDuration: () =>
    set((state) => {
      if (!state.project) return state;
      const maxEnd = Math.max(
        ...state.project.tracks.flatMap((t) =>
          t.clips.map((c) => c.startAt + c.duration),
        ),
        0,
      );
      return {
        project: { ...state.project, duration: Math.max(5, maxEnd) },
      };
    }),
}));
