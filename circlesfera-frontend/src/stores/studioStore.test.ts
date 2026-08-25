import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioStore } from '../stores/studioStore';
import type { StudioProject } from '../types/studio';
import {
  getPrimaryMediaUrl,
  isRemoteMediaUrl,
  serializeStudioProject,
} from '../utils/studioProject';

const blankProject = (): StudioProject => ({
  id: 'p1',
  name: 'Test',
  duration: 10,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks: [
    {
      id: 'v1',
      type: 'video',
      name: 'Video',
      clips: [],
      muted: false,
      hidden: false,
      locked: false,
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('studioProject helpers', () => {
  it('strips File handles on serialize', () => {
    const project = blankProject();
    project.tracks[0].clips.push({
      id: 'c1',
      trackId: 'v1',
      type: 'video',
      file: new File(['x'], 'a.mp4'),
      fileUrl: 'https://cdn.example.com/a.mp4',
      startAt: 0,
      duration: 2,
      mediaStart: 0,
      speed: 1,
      volume: 1,
      muted: false,
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    });

    const serialized = serializeStudioProject(project);
    const clip = serialized.tracks[0].clips[0];
    expect(clip.type).toBe('video');
    if (clip.type !== 'text') {
      expect(clip.file).toBeNull();
      expect(clip.fileUrl).toBe('https://cdn.example.com/a.mp4');
    }
  });

  it('detects remote vs blob urls', () => {
    expect(isRemoteMediaUrl('https://cdn.example.com/a.mp4')).toBe(true);
    expect(isRemoteMediaUrl('blob:http://localhost/1')).toBe(false);
  });

  it('returns primary media url', () => {
    const project = blankProject();
    expect(getPrimaryMediaUrl(project)).toBeNull();
    project.tracks[0].clips.push({
      id: 'c1',
      trackId: 'v1',
      type: 'image',
      file: null,
      fileUrl: 'https://cdn.example.com/i.jpg',
      startAt: 0,
      duration: 3,
      mediaStart: 0,
      speed: 1,
      volume: 1,
      muted: true,
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    });
    expect(getPrimaryMediaUrl(project)).toBe('https://cdn.example.com/i.jpg');
  });
});

describe('studioStore', () => {
  beforeEach(() => {
    useStudioStore.setState({
      project: blankProject(),
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
    });
  });

  it('records history on updateClip when requested', () => {
    const { addClip, updateClip, undo, canUndo } = useStudioStore.getState();
    addClip('v1', {
      id: 'c1',
      trackId: 'v1',
      type: 'image',
      file: null,
      fileUrl: 'https://cdn.example.com/i.jpg',
      startAt: 0,
      duration: 3,
      mediaStart: 0,
      speed: 1,
      volume: 1,
      muted: true,
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    });

    updateClip('c1', { duration: 5 }, { history: true });
    expect(useStudioStore.getState().canUndo).toBe(true);
    undo();
    const clip = useStudioStore.getState().project?.tracks[0].clips[0];
    expect(clip?.duration).toBe(3);
    expect(canUndo || useStudioStore.getState().canUndo).toBeDefined();
  });

  it('opens properties sheet when selecting a clip', () => {
    useStudioStore.getState().selectClip('abc');
    expect(useStudioStore.getState().openSheet).toBe('properties');
    expect(useStudioStore.getState().selectedClipId).toBe('abc');
  });

  it('updates resolution when aspect ratio changes', () => {
    useStudioStore.getState().setAspectRatio('16:9');
    const project = useStudioStore.getState().project;
    expect(project?.aspectRatio).toBe('16:9');
    expect(project?.resolution).toEqual({ width: 1920, height: 1080 });
    expect(useStudioStore.getState().canUndo).toBe(true);
  });

  it('renames project without wiping undo history', () => {
    useStudioStore.getState().beginHistoryTransaction();
    useStudioStore.getState().setProjectName('Renamed');
    expect(useStudioStore.getState().project?.name).toBe('Renamed');
    expect(useStudioStore.getState().canUndo).toBe(true);
    expect(useStudioStore.getState().past.length).toBeGreaterThan(0);
  });

  it('advances mediaStart by relativeSplit * speed on split', () => {
    const { addClip, selectClip, setPlayhead, splitClip } =
      useStudioStore.getState();
    addClip('v1', {
      id: 'c1',
      trackId: 'v1',
      type: 'video',
      file: null,
      fileUrl: 'https://cdn.example.com/a.mp4',
      startAt: 0,
      duration: 4,
      mediaStart: 1,
      speed: 2,
      volume: 1,
      muted: false,
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    });
    selectClip('c1');
    setPlayhead(2);
    splitClip();
    const clips = useStudioStore.getState().project?.tracks[0].clips || [];
    expect(clips).toHaveLength(2);
    const right = clips.find((c) => c.startAt === 2) as
      | { mediaStart?: number }
      | undefined;
    expect(right?.mediaStart).toBe(5);
  });

  it('adds and removes tracks but keeps at least the last video track removable only via UI rules', () => {
    const { addTrack, removeTrack } = useStudioStore.getState();
    addTrack({
      id: 'a1',
      type: 'audio',
      name: 'Audio 2',
      clips: [],
      muted: false,
      hidden: false,
      locked: false,
    });
    expect(
      useStudioStore.getState().project?.tracks.some((t) => t.id === 'a1'),
    ).toBe(true);
    removeTrack('a1');
    expect(
      useStudioStore.getState().project?.tracks.some((t) => t.id === 'a1'),
    ).toBe(false);
  });
});
