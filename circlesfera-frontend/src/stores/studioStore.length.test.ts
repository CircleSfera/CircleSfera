import { beforeEach, describe, expect, it } from 'vitest';
import type { MediaClip, StudioProject, Track } from '../types/studio';
import { projectContentEnd, withLengthOfClips } from '../utils/studioProject';
import { useStudioStore } from './studioStore';

const clip = (id: string, over: Partial<MediaClip> = {}): MediaClip => ({
  id,
  trackId: 'v1',
  type: 'video',
  file: null,
  fileUrl: `https://cdn.example.com/${id}.mp4`,
  startAt: 0,
  duration: 8,
  mediaStart: 0,
  speed: 1,
  volume: 1,
  muted: false,
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

const track = (id: string, clips: MediaClip[] = [], hidden = false): Track => ({
  id,
  type: 'video',
  name: id,
  clips,
  muted: false,
  hidden,
  locked: false,
});

const project = (tracks: Track[], duration = 10): StudioProject => ({
  id: 'p1',
  name: 'Edit',
  duration,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks,
  createdAt: '',
  updatedAt: '',
});

const store = () => useStudioStore.getState();
const length = () => store().project?.duration;

describe('where the last clip of a project ends', () => {
  it('is zero with no clips', () => {
    expect(projectContentEnd(project([track('v1')]))).toBe(0);
  });

  it('is the latest end among every track', () => {
    const tracks = [
      track('v1', [clip('a', { startAt: 2, duration: 5 })]),
      track('v2', [clip('b', { startAt: 4, duration: 9 })]),
    ];

    expect(projectContentEnd(project(tracks))).toBe(13);
  });

  it('leaves hidden tracks out when asked', () => {
    const tracks = [
      track('v1', [clip('a', { duration: 5 })]),
      track('v2', [clip('b', { duration: 40 })], true),
    ];

    expect(projectContentEnd(project(tracks), { visibleOnly: true })).toBe(5);
    expect(projectContentEnd(project(tracks))).toBe(40);
  });

  it('gives a project the length of its clips, never under five seconds', () => {
    expect(
      withLengthOfClips(project([track('v1', [clip('a', { duration: 2 })])]))
        .duration,
    ).toBe(5);
    expect(
      withLengthOfClips(project([track('v1', [clip('a', { duration: 31 })])]))
        .duration,
    ).toBe(31);
  });

  it('leaves a project with no clips as long as it was', () => {
    const empty = project([track('v1')], 10);

    expect(withLengthOfClips(empty)).toBe(empty);
  });
});

describe('the length of a studio project follows its clips', () => {
  beforeEach(() => {
    useStudioStore.setState({
      project: project([track('v1'), track('v2')]),
      playhead: 0,
      selectedClipId: null,
      openSheet: null,
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    });
  });

  it('grows when a clip ends later than the project', () => {
    store().addClip('v1', clip('long', { duration: 60 }));

    expect(length()).toBe(60);
  });

  it('shrinks to the clip when a new project gets a short one', () => {
    // A new project starts at ten seconds.
    store().addClip('v1', clip('short', { duration: 6 }));

    expect(length()).toBe(6);
  });

  it('shrinks when the longest clip is removed', () => {
    store().addClip('v1', clip('long', { duration: 60 }));
    store().addClip('v2', clip('short', { duration: 7 }));

    store().removeClip('long');

    expect(length()).toBe(7);
  });

  it('follows a clip that is moved or stretched past the end, and one that is trimmed', () => {
    store().addClip('v1', clip('a', { duration: 8 }));

    store().updateClip('a', { startAt: 12 });
    expect(length()).toBe(20);

    store().updateClip('a', { startAt: 0, duration: 6 });
    expect(length()).toBe(6);
  });

  it('shrinks when the track holding the longest clip is removed', () => {
    store().addClip('v1', clip('short', { duration: 7 }));
    store().addClip('v2', clip('long', { duration: 60 }));

    store().removeTrack('v2');

    expect(length()).toBe(7);
  });

  it('stays the same when a clip is split', () => {
    store().addClip('v1', clip('a', { duration: 20 }));
    useStudioStore.setState({ selectedClipId: 'a', playhead: 8 });

    store().splitClip();

    expect(length()).toBe(20);
    expect(store().project?.tracks[0].clips).toHaveLength(2);
  });

  it('keeps its length when its last clip is removed, with nothing left to measure', () => {
    store().addClip('v1', clip('a', { duration: 30 }));

    store().removeClip('a');

    expect(length()).toBe(30);
  });

  it('comes back with undo and redo', () => {
    store().addClip('v1', clip('long', { duration: 60 }));
    store().removeClip('long');
    store().addClip('v1', clip('short', { duration: 6 }));
    expect(length()).toBe(6);

    store().undo();
    store().undo();
    expect(length()).toBe(60);

    store().redo();
    store().redo();
    expect(length()).toBe(6);
  });

  it('is recalculated on request', () => {
    useStudioStore.setState({
      project: project([track('v1', [clip('a', { duration: 12 })])], 99),
    });

    store().calculateDuration();

    expect(length()).toBe(12);
  });
});
