import { create } from 'zustand';
import type { Clip, StudioProject, Track } from '../types/studio';

interface StudioState {
  project: StudioProject | null;
  cloudProjectId: string | null;
  playhead: number; // Current time in seconds
  isPlaying: boolean;
  selectedClipId: string | null;
  zoom: number; // Pixels per second

  // Actions
  setProject: (project: StudioProject) => void;
  setCloudProjectId: (id: string | null) => void;
  setPlayhead: (time: number) => void;
  togglePlayback: () => void;
  setPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
  selectClip: (clipId: string | null) => void;

  // Track & Clip mutations
  addTrack: (track: Track) => void;
  removeTrack: (trackId: string) => void;
  addClip: (trackId: string, clip: Clip) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  splitClip: () => void;

  // Computed helpers (these are normally getters, but we'll use actions to trigger re-renders if needed)
  calculateDuration: () => void;
}

export const useStudioStore = create<StudioState>((set) => ({
  project: null,
  cloudProjectId: null,
  playhead: 0,
  isPlaying: false,
  selectedClipId: null,
  zoom: 50, // 50px = 1 second by default

  setProject: (project) => set({ project }),

  setCloudProjectId: (id) => set({ cloudProjectId: id }),

  setPlayhead: (time) => set({ playhead: Math.max(0, time) }),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setPlaying: (playing) => set({ isPlaying: playing }),

  setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(200, zoom)) }),

  selectClip: (clipId) => set({ selectedClipId: clipId }),

  addTrack: (track) =>
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          tracks: [...state.project.tracks, track],
        },
      };
    }),

  removeTrack: (trackId) =>
    set((state) => {
      if (!state.project) return state;
      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.filter((t) => t.id !== trackId),
        },
      };
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

      // Auto-calculate new duration
      const maxEnd = Math.max(
        ...tracks.flatMap((t) => t.clips.map((c) => c.startAt + c.duration)),
        state.project.duration,
      );

      return {
        project: { ...state.project, tracks, duration: maxEnd },
      };
    }),

  updateClip: (clipId, updates) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? ({ ...c, ...updates } as Clip) : c,
        ),
      }));
      return { project: { ...state.project, tracks } };
    }),

  removeClip: (clipId) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      }));
      return {
        project: { ...state.project, tracks },
        selectedClipId:
          state.selectedClipId === clipId ? null : state.selectedClipId,
      };
    }),

  splitClip: () =>
    set((state) => {
      if (!state.project || !state.selectedClipId) return state;

      const { playhead, selectedClipId } = state;

      // Find the clip and its track
      let targetTrack: Track | undefined;
      let targetClip: Clip | undefined;

      for (const t of state.project.tracks) {
        const c = t.clips.find((c) => c.id === selectedClipId);
        if (c) {
          targetTrack = t;
          targetClip = c;
          break;
        }
      }

      if (!targetTrack || !targetClip) return state;

      // Check if playhead is strictly inside the clip
      const clipEnd = targetClip.startAt + targetClip.duration;
      if (playhead <= targetClip.startAt || playhead >= clipEnd) {
        return state; // Playhead is not inside the clip, cannot split
      }

      const relativeSplit = playhead - targetClip.startAt;

      // We need a generateId fallback here since uuid is not imported
      const generateId = () =>
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2);

      const newClip: any = {
        ...targetClip,
        id: generateId(),
        startAt: playhead,
        duration: targetClip.duration - relativeSplit,
      };

      if (targetClip.type !== 'text') {
        newClip.mediaStart = (targetClip as any).mediaStart + relativeSplit;
      }

      const updatedTracks = state.project.tracks.map((t) => {
        if (t.id === targetTrack!.id) {
          const updatedClips = t.clips.map((c) => {
            if (c.id === targetClip!.id) {
              return { ...c, duration: relativeSplit } as Clip;
            }
            return c;
          });
          // Add the new clip
          updatedClips.push(newClip);
          return { ...t, clips: updatedClips };
        }
        return t;
      });

      return { project: { ...state.project, tracks: updatedTracks } };
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
        project: { ...state.project, duration: Math.max(5, maxEnd) }, // minimum 5 sec duration
      };
    }),
}));
