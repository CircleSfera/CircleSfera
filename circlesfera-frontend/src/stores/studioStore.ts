import { create } from 'zustand';
import type {
  AspectRatioType,
  Clip,
  ClipTransition,
  MediaClip,
  StudioPanel,
  StudioProject,
  StudioTab,
  Track,
} from '../types/studio';
import {
  clampFade,
  ducksUnderVoice,
  withDetachedSound,
} from '../utils/studioAudio';
import { resolutionForAspect } from '../utils/studioExportHelpers';
import { withLengthOfClips } from '../utils/studioProject';
import {
  layerFor,
  locateClip,
  mainClips,
  mainTrackOf,
  moveMainClip,
  newStudioId,
  packMainTrack,
  duplicateClip as withDuplicate,
  withoutEmptyLayers,
  withSpeed,
} from '../utils/studioTimeline';
import { withoutTransition, withTransition } from '../utils/studioTransitions';

// Every change leaves the main track with no gaps and the project as long
// as its clips.
const settle = (project: StudioProject) =>
  withLengthOfClips(packMainTrack(project));

interface StudioState {
  project: StudioProject | null;
  cloudProjectId: string | null;
  playhead: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  /** The cut chosen on the main track: the id of the clip before it. */
  selectedCut: string | null;
  zoom: number;
  activeTab: StudioTab;
  openSheet: StudioPanel | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  /** A voice is being recorded: the preview plays silent. */
  isRecordingVoice: boolean;
  setRecordingVoice: (on: boolean) => void;

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
  /** Chooses the cut after a clip of the main track and opens its transitions. */
  selectCut: (clipId: string | null) => void;
  /** Sets the transition of a cut, or takes it away. */
  setTransition: (
    clipId: string,
    transition: ClipTransition | undefined,
  ) => void;
  /** Sets the same transition on every cut of the main track. */
  setAllTransitions: (transition: ClipTransition | undefined) => void;
  setActiveTab: (tab: StudioTab) => void;
  setOpenSheet: (sheet: StudioPanel | null) => void;
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
  /** Moves a clip of the main track to another place in it. */
  moveClip: (clipId: string, toIndex: number) => void;
  /** Copies the selected clip, right after it, and selects the copy. */
  duplicateSelected: (newTrack: (type: Track['type']) => Track) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  /** Puts other media in a clip, keeping where it is and how long it is. */
  replaceClipMedia: (
    clipId: string,
    media: Pick<MediaClip, 'type' | 'file' | 'fileUrl'> & {
      sourceDuration: number | null;
    },
  ) => void;
  /**
   * Points every clip showing a file at another address, in the project and
   * in its history: a copy made while the file was uploading included.
   */
  replaceMediaUrl: (from: string, to: string) => void;
  /** Sets how long a clip's sound fades in and out, within their limits. */
  setClipFades: (
    clipId: string,
    fades: { fadeIn?: number; fadeOut?: number },
    options?: { history?: boolean },
  ) => void;
  /** Takes a video's sound out onto a sound layer and chooses it. */
  detachSound: (clipId: string, newTrack: () => Track) => void;
  /** Whether other sound drops while a voice speaks. */
  setDuckUnderVoice: (on: boolean) => void;
  /** Adds a text or a sound on the first layer of its kind free there. */
  addLayerClip: (
    type: 'text' | 'audio' | 'voice' | 'effect',
    clip: Clip,
    newTrack: () => Track,
  ) => void;

  calculateDuration: () => void;
}

// The panels that act on the chosen clip.
const CLIP_PANELS: ReadonlySet<StudioPanel> = new Set([
  'speed',
  'volume',
  'fades',
  'adjust',
  'filters',
  'color',
  'effect',
]);

// After undo or redo, a chosen clip that is no longer there is let go, and
// a panel of that clip closes; a panel of the project stays open.
const withoutLostSelection = (
  state: StudioState,
  project: StudioProject,
): Partial<StudioState> => {
  const lost: Partial<StudioState> = {};
  if (state.selectedCut && !hasCutAfter(project, state.selectedCut)) {
    lost.selectedCut = null;
    if (state.openSheet === 'transition') lost.openSheet = null;
  }
  if (state.selectedClipId && !locateClip(project, state.selectedClipId)) {
    lost.selectedClipId = null;
    if (state.openSheet && CLIP_PANELS.has(state.openSheet)) {
      lost.openSheet = null;
    }
  }
  return lost;
};

// Whether a clip of the main track has another after it.
const hasCutAfter = (project: StudioProject, clipId: string) => {
  const ordered = mainClips(project);
  const index = ordered.findIndex((c) => c.id === clipId);
  return index >= 0 && index < ordered.length - 1;
};

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
  selectedCut: null,
  zoom: 50,
  activeTab: 'media',
  openSheet: null,
  saveStatus: 'idle',
  isRecordingVoice: false,
  setRecordingVoice: (on) => set({ isRecordingVoice: on }),

  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  // A project is opened as it was saved, only without its empty layers. One
  // made before the main track kept its clips together has them brought
  // together on its first change, which can be undone.
  setProject: (project) =>
    set({
      project: withoutEmptyLayers(project),
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

  // Choosing a clip turns the tools to that clip; what was open closes.
  selectClip: (clipId) =>
    set((state) =>
      clipId === state.selectedClipId
        ? // Letting go with nothing chosen lets go of a chosen cut.
          clipId === null && state.selectedCut
          ? {
              selectedCut: null,
              openSheet:
                state.openSheet === 'transition' ? null : state.openSheet,
            }
          : state
        : { selectedClipId: clipId, selectedCut: null, openSheet: null },
    ),

  selectCut: (clipId) =>
    set({
      selectedCut: clipId,
      selectedClipId: null,
      openSheet: clipId ? 'transition' : null,
    }),

  setTransition: (clipId, transition) =>
    set((state) => {
      if (!state.project) return state;
      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? withTransition(c, transition) : c,
        ),
      }));
      return pushHistory(state, settle({ ...state.project, tracks }));
    }),

  setAllTransitions: (transition) =>
    set((state) => {
      if (!state.project) return state;
      const main = mainTrackOf(state.project);
      if (!main) return state;
      const tracks = state.project.tracks.map((t) =>
        t === main
          ? { ...t, clips: t.clips.map((c) => withTransition(c, transition)) }
          : t,
      );
      return pushHistory(state, settle({ ...state.project, tracks }));
    }),

  setActiveTab: (tab) => set({ activeTab: tab, openSheet: tab }),

  // A cut stays chosen only while its transitions are open.
  setOpenSheet: (sheet) =>
    set((state) => ({
      openSheet: sheet,
      selectedCut: sheet === 'transition' ? state.selectedCut : null,
    })),

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
        ...withoutLostSelection(state, previous),
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
        ...withoutLostSelection(state, next),
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
      const updated = withLengthOfClips({
        ...state.project,
        tracks: state.project.tracks.filter((t) => t.id !== trackId),
      });
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

      // The length of the project follows its clips, both ways: it is not
      // only raised when one is added.
      const updated = settle({ ...state.project, tracks });
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
      const updated = settle({ ...state.project, tracks });
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
      // A layer left with no clips goes with it.
      const updated = settle(withoutEmptyLayers({ ...state.project, tracks }));
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

      const newClip: Clip = {
        ...targetClip,
        id: newStudioId(),
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
              // The second half keeps the way into the next clip.
              return withoutTransition({
                ...c,
                duration: relativeSplit,
              } as Clip);
            }
            return c;
          });
          updatedClips.push(newClip);
          return { ...t, clips: updatedClips };
        }
        return t;
      });

      const updatedProject = settle({
        ...state.project,
        tracks: updatedTracks,
      });
      return pushHistory(state, updatedProject);
    }),

  moveClip: (clipId, toIndex) =>
    set((state) => {
      if (!state.project) return state;
      const moved = moveMainClip(state.project, clipId, toIndex);
      if (moved === state.project) return state;
      return pushHistory(state, settle(moved));
    }),

  duplicateSelected: (newTrack) =>
    set((state) => {
      if (!state.project || !state.selectedClipId) return state;
      const id = newStudioId();
      const updated = withDuplicate(
        state.project,
        state.selectedClipId,
        id,
        newTrack,
      );
      if (updated === state.project) return state;
      return { ...pushHistory(state, settle(updated)), selectedClipId: id };
    }),

  setClipSpeed: (clipId, speed) =>
    set((state) => {
      if (!state.project) return state;
      const found = locateClip(state.project, clipId);
      if (!found || found.clip.type === 'text') return state;
      const changed = withSpeed(found.clip as MediaClip, speed);
      if (changed === found.clip) return state;
      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? changed : c)),
      }));
      return pushHistory(state, settle({ ...state.project, tracks }));
    }),

  replaceClipMedia: (clipId, media) =>
    set((state) => {
      if (!state.project) return state;
      const found = locateClip(state.project, clipId);
      if (!found || found.clip.type === 'text') return state;
      const clip = found.clip as MediaClip;
      // A shorter video makes the clip shorter; a photo lasts as long as
      // the clip did.
      const longest =
        media.sourceDuration === null
          ? clip.duration
          : media.sourceDuration / (clip.speed || 1);
      const replaced: MediaClip = {
        ...clip,
        type: media.type,
        file: media.file,
        fileUrl: media.fileUrl,
        mediaStart: 0,
        sourceDuration: media.sourceDuration ?? undefined,
        muted: media.type === 'image' ? true : clip.muted,
        duration: Math.min(clip.duration, longest),
      };
      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? replaced : c)),
      }));
      return pushHistory(state, settle({ ...state.project, tracks }));
    }),

  setClipFades: (clipId, fades, options) =>
    set((state) => {
      if (!state.project) return state;
      const found = locateClip(state.project, clipId);
      if (!found || found.clip.type === 'text') return state;
      const clip = found.clip as MediaClip;
      const next: MediaClip = {
        ...clip,
        ...(fades.fadeIn !== undefined
          ? { fadeIn: clampFade(fades.fadeIn, clip.duration) }
          : {}),
        ...(fades.fadeOut !== undefined
          ? { fadeOut: clampFade(fades.fadeOut, clip.duration) }
          : {}),
      };
      if (next.fadeIn === clip.fadeIn && next.fadeOut === clip.fadeOut) {
        return state;
      }
      const tracks = state.project.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? next : c)),
      }));
      const updated = { ...state.project, tracks };
      return options?.history === false
        ? { project: updated }
        : pushHistory(state, updated);
    }),

  detachSound: (clipId, newTrack) =>
    set((state) => {
      if (!state.project) return state;
      const done = withDetachedSound(state.project, clipId, newTrack);
      if (!done) return state;
      return {
        ...pushHistory(state, settle(done.project)),
        selectedClipId: done.soundId,
        openSheet: null,
      };
    }),

  setDuckUnderVoice: (on) =>
    set((state) => {
      if (!state.project || ducksUnderVoice(state.project) === on) return state;
      return pushHistory(state, { ...state.project, duckUnderVoice: on });
    }),

  replaceMediaUrl: (from, to) =>
    set((state) => {
      const swap = (project: StudioProject): StudioProject => {
        let changed = false;
        const tracks = project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.type === 'text' || (c as MediaClip).fileUrl !== from)
              return c;
            changed = true;
            return { ...c, fileUrl: to, file: null } as Clip;
          }),
        }));
        return changed ? { ...project, tracks } : project;
      };
      if (!state.project) return state;
      return {
        project: swap(state.project),
        past: state.past.map(swap),
        future: state.future.map(swap),
      };
    }),

  addLayerClip: (type, clip, newTrack) =>
    set((state) => {
      if (!state.project) return state;
      const { project, trackId } = layerFor(
        state.project,
        type,
        clip.startAt,
        clip.duration,
        newTrack,
      );
      const tracks = project.tracks.map((t) =>
        t.id === trackId
          ? { ...t, clips: [...t.clips, { ...clip, trackId } as Clip] }
          : t,
      );
      return {
        ...pushHistory(state, settle({ ...project, tracks })),
        selectedClipId: clip.id,
      };
    }),

  calculateDuration: () =>
    set((state) => {
      if (!state.project) return state;
      return { project: withLengthOfClips(state.project) };
    }),
}));
