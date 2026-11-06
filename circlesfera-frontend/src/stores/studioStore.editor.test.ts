import { beforeEach, describe, expect, it } from 'vitest';
import {
  mediaClip,
  openStudioProject,
  studioTrack,
  textClip,
} from '../test/studio-fixtures';
import type { MediaClip, StudioProject, Track } from '../types/studio';
import { useStudioStore } from './studioStore';

const store = () => useStudioStore.getState();
const tracks = () => store().project?.tracks ?? [];
const main = () => tracks()[0].clips as MediaClip[];
const layer = (type: Track['type']) => (): Track => ({
  id: `new-${type}`,
  type,
  name: type,
  clips: [],
  muted: false,
  hidden: false,
  locked: false,
});

describe('the studio store, for the editor', () => {
  beforeEach(() => {
    openStudioProject([
      studioTrack('v1', 'video', [
        mediaClip('a', { trackId: 'v1', startAt: 0, duration: 2 }),
        mediaClip('b', { trackId: 'v1', startAt: 2, duration: 4 }),
      ]),
    ]);
  });

  it('opens a project with its main track together and without empty layers', () => {
    const old: StudioProject = {
      ...(store().project as StudioProject),
      tracks: [
        studioTrack('v1', 'video', [
          mediaClip('x', { trackId: 'v1', startAt: 5, duration: 3 }),
        ]),
        studioTrack('t1', 'text'),
      ],
    };
    store().setProject(old);
    expect(tracks().map((t) => t.id)).toEqual(['v1']);
    expect(main()[0].startAt).toBe(0);
    expect(store().canUndo).toBe(false);
  });

  it('moves a clip of the main track, and undoes it', () => {
    store().moveClip('a', 1);
    expect(main().map((c) => [c.id, c.startAt])).toEqual([
      ['b', 0],
      ['a', 4],
    ]);
    store().moveClip('a', 1);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(main()[0].id).toBe('a');
  });

  it('duplicates the chosen clip and chooses the copy; nothing with none chosen', () => {
    store().duplicateSelected(layer('video'));
    expect(main()).toHaveLength(2);
    useStudioStore.setState({ selectedClipId: 'missing' });
    store().duplicateSelected(layer('video'));
    expect(main()).toHaveLength(2);
    useStudioStore.setState({ selectedClipId: 'a' });
    store().duplicateSelected(layer('video'));
    expect(main().map((c) => c.startAt)).toEqual([0, 2, 4]);
    expect(store().selectedClipId).toBe(main()[1].id);
  });

  it('sets the speed of a clip, and the clips after it follow', () => {
    store().setClipSpeed('a', 0.5);
    expect(main()[0]).toMatchObject({ speed: 0.5, duration: 4 });
    expect(main()[1].startAt).toBe(4);
    const before = store().project;
    store().setClipSpeed('a', 0.5);
    store().setClipSpeed('missing', 2);
    expect(store().project).toBe(before);
  });

  it('gives a text no speed', () => {
    openStudioProject([
      studioTrack('v1', 'video'),
      studioTrack('t1', 'text', [textClip('w', { trackId: 't1' })]),
    ]);
    const before = store().project;
    store().setClipSpeed('w', 2);
    expect(store().project).toBe(before);
  });

  it('replaces the media of a clip, shorter when the new video is shorter', () => {
    store().replaceClipMedia('b', {
      type: 'video',
      file: null,
      fileUrl: 'https://cdn/new.mp4',
      sourceDuration: 3,
    });
    expect(main()[1]).toMatchObject({
      id: 'b',
      fileUrl: 'https://cdn/new.mp4',
      duration: 3,
      mediaStart: 0,
    });
    store().replaceClipMedia('b', {
      type: 'image',
      file: null,
      fileUrl: 'https://cdn/p.jpg',
      sourceDuration: null,
    });
    expect(main()[1]).toMatchObject({
      type: 'image',
      duration: 3,
      muted: true,
    });
  });

  it('replaces nothing for a text or a clip that is not there', () => {
    openStudioProject([
      studioTrack('v1', 'video'),
      studioTrack('t1', 'text', [textClip('w', { trackId: 't1' })]),
    ]);
    const before = store().project;
    store().replaceClipMedia('w', {
      type: 'image',
      file: null,
      fileUrl: 'x',
      sourceDuration: null,
    });
    store().replaceClipMedia('missing', {
      type: 'image',
      file: null,
      fileUrl: 'x',
      sourceDuration: null,
    });
    expect(store().project).toBe(before);
  });

  it('adds a text on a layer of its own and chooses it', () => {
    store().addLayerClip('text', textClip('w', { startAt: 1 }), layer('text'));
    expect(tracks()[1]).toMatchObject({ id: 'new-text', type: 'text' });
    expect(tracks()[1].clips[0]).toMatchObject({
      id: 'w',
      trackId: 'new-text',
    });
    expect(store().selectedClipId).toBe('w');
  });

  it('drops a layer when its last clip is removed', () => {
    store().addLayerClip('text', textClip('w'), layer('text'));
    store().removeClip('w');
    expect(tracks()).toHaveLength(1);
  });

  it('does nothing without a project', () => {
    useStudioStore.setState({ project: null });
    store().moveClip('a', 1);
    store().duplicateSelected(layer('video'));
    store().setClipSpeed('a', 2);
    store().replaceClipMedia('a', {
      type: 'image',
      file: null,
      fileUrl: 'x',
      sourceDuration: null,
    });
    store().addLayerClip('text', textClip('w'), layer('text'));
    expect(store().project).toBeNull();
  });
});
