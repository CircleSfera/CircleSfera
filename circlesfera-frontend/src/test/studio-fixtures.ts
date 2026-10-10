import { useStudioStore } from '../stores/studioStore';
import type {
  Clip,
  MediaClip,
  StudioProject,
  TextClip,
  Track,
} from '../types/studio';

/** A video clip already in the cloud: six seconds, starting at second two. */
export const mediaClip = (
  id: string,
  over: Partial<MediaClip> = {},
): MediaClip => ({
  id,
  type: 'video',
  trackId: 'v1',
  startAt: 2,
  duration: 6,
  fileUrl: `https://cdn.example.com/${id}.mp4`,
  file: null,
  mediaStart: 0,
  speed: 1,
  volume: 1,
  muted: false,
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

export const textClip = (
  id: string,
  over: Partial<TextClip> = {},
): TextClip => ({
  id,
  type: 'text',
  trackId: 't1',
  startAt: 2,
  duration: 6,
  content: 'Hello',
  style: {
    fontFamily: 'Inter',
    fontSize: 40,
    color: '#ffffff',
    backgroundColor: 'transparent',
    textAlign: 'center',
  },
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

export const studioTrack = (
  id: string,
  type: Track['type'],
  clips: Clip[] = [],
): Track => ({
  id,
  type,
  name: id,
  clips,
  muted: false,
  hidden: false,
  locked: false,
});

export const studioProject = (
  tracks: Track[],
  over: Partial<StudioProject> = {},
): StudioProject => ({
  id: 'p1',
  name: 'Edit',
  tracks,
  duration: 20,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  createdAt: '',
  updatedAt: '',
  ...over,
});

/** Puts a project in the studio store, with nothing to undo. */
export function openStudioProject(
  tracks: Track[],
  state: Partial<ReturnType<typeof useStudioStore.getState>> = {},
) {
  useStudioStore.setState({
    project: studioProject(tracks),
    cloudProjectId: null,
    selectedClipId: null,
    playhead: 0,
    zoom: 10,
    isPlaying: false,
    openSheet: null,
    activeTab: 'media',
    saveStatus: 'idle',
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
    ...state,
  });
}

/** Every clip of the project in the store, track after track. */
export const studioClips = (): Clip[] =>
  useStudioStore.getState().project?.tracks.flatMap((tr) => tr.clips) ?? [];

export const studioClip = <T extends Clip = MediaClip>(id: string): T =>
  studioClips().find((c) => c.id === id) as T;
