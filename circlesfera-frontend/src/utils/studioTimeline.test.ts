import { describe, expect, it } from 'vitest';
import type {
  MediaClip,
  StudioProject,
  TextClip,
  Track,
} from '../types/studio';
import { newBlankProject, STUDIO_FPS } from './studioProjects';
import {
  duplicateClip,
  emptyTrack,
  isOnMainTrack,
  layerFor,
  locateClip,
  MAX_CLIP_SPEED,
  MIN_CLIP_SEC,
  MIN_CLIP_SPEED,
  mainClips,
  mainTrackEnd,
  moveMainClip,
  newStudioId,
  packMainTrack,
  trimmedClip,
  withoutEmptyLayers,
  withSpeed,
} from './studioTimeline';

const media = (id: string, over: Partial<MediaClip> = {}): MediaClip => ({
  id,
  type: 'video',
  trackId: 'main',
  startAt: 0,
  duration: 4,
  fileUrl: `https://cdn/${id}.mp4`,
  file: null,
  mediaStart: 0,
  speed: 1,
  volume: 1,
  muted: false,
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

const words = (id: string, over: Partial<TextClip> = {}): TextClip => ({
  id,
  type: 'text',
  trackId: 'text',
  startAt: 0,
  duration: 3,
  content: id,
  style: {
    fontFamily: 'Roboto',
    fontSize: 40,
    color: '#fff',
    backgroundColor: 'transparent',
    textAlign: 'center',
  },
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

const track = (
  id: string,
  type: Track['type'],
  clips: Track['clips'] = [],
  locked = false,
): Track => ({
  id,
  type,
  name: id,
  clips,
  muted: false,
  hidden: false,
  locked,
});

const project = (...tracks: Track[]): StudioProject => ({
  id: 'p',
  name: 'P',
  duration: 0,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks,
  createdAt: '',
  updatedAt: '',
});

let counter = 0;
const newTrack = (type: Track['type']) => track(`new-${++counter}`, type);

describe('the main track', () => {
  it('is the first video track; nothing without one', () => {
    const p = project(
      track('text', 'text'),
      track('main', 'video', [media('a')]),
      track('over', 'video'),
    );
    expect(isOnMainTrack(p, 'a')).toBe(true);
    expect(mainClips(project(track('text', 'text')))).toEqual([]);
    expect(mainTrackEnd(project(track('text', 'text')))).toBe(0);
    expect(packMainTrack(project(track('text', 'text')))).toEqual(
      project(track('text', 'text')),
    );
  });

  it('lays its clips end to end, in their order, closing every gap', () => {
    const p = project(
      track('main', 'video', [
        media('b', { startAt: 9, duration: 2 }),
        media('a', { startAt: 1, duration: 3 }),
      ]),
    );
    const packed = packMainTrack(p);
    expect(packed.tracks[0].clips.map((c) => [c.id, c.startAt])).toEqual([
      ['a', 0],
      ['b', 3],
    ]);
    expect(mainTrackEnd(packed)).toBe(5);
  });

  it('is left as it is when already together', () => {
    const p = project(
      track('main', 'video', [media('a'), media('b', { startAt: 4 })]),
    );
    expect(packMainTrack(p)).toBe(p);
  });

  it('moves a clip to another place, and keeps the others together', () => {
    const p = project(
      track('main', 'video', [
        media('a', { duration: 1 }),
        media('b', { startAt: 1, duration: 2 }),
        media('c', { startAt: 3, duration: 3 }),
      ]),
    );
    const moved = moveMainClip(p, 'a', 2);
    expect(moved.tracks[0].clips.map((c) => [c.id, c.startAt])).toEqual([
      ['b', 0],
      ['c', 2],
      ['a', 5],
    ]);
    expect(moveMainClip(p, 'a', 99).tracks[0].clips.at(-1)?.id).toBe('a');
    expect(moveMainClip(p, 'a', 0)).toBe(p);
    expect(moveMainClip(p, 'missing', 1)).toBe(p);
  });
});

describe('layers', () => {
  it('puts a clip on the first layer of its kind free there', () => {
    const p = project(
      track('main', 'video'),
      track('t1', 'text', [words('x', { startAt: 0, duration: 3 })]),
      track('t2', 'text'),
    );
    expect(layerFor(p, 'text', 5, 2, () => newTrack('text'))).toEqual({
      project: p,
      trackId: 't1',
    });
    expect(layerFor(p, 'text', 1, 2, () => newTrack('text')).trackId).toBe(
      't2',
    );
  });

  it('makes a new layer when every one of its kind is taken there, or locked', () => {
    const p = project(track('main', 'video'), track('a1', 'audio', [], true));
    const { project: next, trackId } = layerFor(p, 'audio', 0, 2, () =>
      newTrack('audio'),
    );
    expect(next.tracks).toHaveLength(3);
    expect(next.tracks[2]).toMatchObject({ id: trackId, type: 'audio' });
  });

  it('are dropped when empty; the main track is kept even then', () => {
    const p = project(
      track('main', 'video'),
      track('t1', 'text'),
      track('a1', 'audio', [media('s', { type: 'audio' })]),
    );
    expect(withoutEmptyLayers(p).tracks.map((t) => t.id)).toEqual([
      'main',
      'a1',
    ]);
    const full = project(track('main', 'video'));
    expect(withoutEmptyLayers(full)).toBe(full);
  });
});

describe('speed', () => {
  it('makes a clip shorter when faster and longer when slower', () => {
    expect(withSpeed(media('a', { duration: 10 }), 2)).toMatchObject({
      speed: 2,
      duration: 5,
    });
    expect(
      withSpeed(media('a', { duration: 10, speed: 2 }), 0.5),
    ).toMatchObject({ speed: 0.5, duration: 40 });
  });

  it('stays within its limits, and is unchanged at the same speed', () => {
    const clip = media('a');
    expect(withSpeed(clip, 100).speed).toBe(MAX_CLIP_SPEED);
    expect(withSpeed(clip, 0).speed).toBe(MIN_CLIP_SPEED);
    expect(withSpeed(clip, 1)).toBe(clip);
  });
});

describe('a copy of a clip', () => {
  it('plays right after it on the main track', () => {
    const p = project(
      track('main', 'video', [
        media('a', { duration: 2 }),
        media('b', { startAt: 2, duration: 3 }),
      ]),
    );
    const next = duplicateClip(p, 'a', 'copy', newTrack);
    expect(next.tracks[0].clips.map((c) => [c.id, c.startAt])).toEqual([
      ['a', 0],
      ['copy', 2],
      ['b', 4],
    ]);
  });

  it('starts where it ends on its layer, or on a new layer when that is taken', () => {
    const free = project(
      track('main', 'video'),
      track('t', 'text', [words('w')]),
    );
    expect(
      duplicateClip(free, 'w', 'w2', newTrack).tracks[1].clips[1],
    ).toMatchObject({ id: 'w2', startAt: 3, trackId: 't' });

    const taken = project(
      track('main', 'video'),
      track('t', 'text', [words('w'), words('next', { startAt: 3 })]),
    );
    const next = duplicateClip(taken, 'w', 'w2', newTrack);
    expect(next.tracks).toHaveLength(3);
    expect(next.tracks[2].clips[0]).toMatchObject({
      id: 'w2',
      startAt: 3,
      trackId: next.tracks[2].id,
    });
  });

  it('is nothing for a clip that is not there', () => {
    const p = project(track('main', 'video'));
    expect(duplicateClip(p, 'missing', 'x', newTrack)).toBe(p);
    expect(locateClip(p, 'missing')).toBeNull();
  });
});

describe('trimming', () => {
  it('takes more or less of the start of the file, keeping the end where it is', () => {
    const clip = media('a', {
      startAt: 2,
      duration: 4,
      mediaStart: 1,
      speed: 2,
    });
    expect(trimmedClip(clip, 'start', 1)).toMatchObject({
      startAt: 3,
      duration: 3,
      mediaStart: 3,
    });
    // No further back than the start of the file, or of the timeline.
    expect(trimmedClip(clip, 'start', -5)).toMatchObject({
      startAt: 1.5,
      duration: 4.5,
      mediaStart: 0,
    });
    expect(trimmedClip(clip, 'start', 10).duration).toBe(MIN_CLIP_SEC);
  });

  it('takes more or less of the end, no more than the file has', () => {
    const clip = media('a', { duration: 4, mediaStart: 2, sourceDuration: 10 });
    expect(trimmedClip(clip, 'end', 2).duration).toBe(6);
    expect(trimmedClip(clip, 'end', 20).duration).toBe(8);
    expect(trimmedClip(clip, 'end', -20).duration).toBe(MIN_CLIP_SEC);
  });

  it('cuts a clip whose file length is unknown shorter, never longer', () => {
    const old = media('a', { duration: 4 });
    expect(trimmedClip(old, 'end', 3).duration).toBe(4);
    expect(trimmedClip(old, 'end', -1).duration).toBe(3);
  });

  it('lets a photo or a text last as long as wanted', () => {
    expect(
      trimmedClip(media('p', { type: 'image', sourceDuration: 1 }), 'end', 20)
        .duration,
    ).toBe(24);
    expect(trimmedClip(words('w', { startAt: 5 }), 'start', -3)).toMatchObject({
      startAt: 2,
      duration: 6,
    });
  });
});

describe('new things', () => {
  it('gets an id of its own each time', () => {
    expect(newStudioId()).not.toBe(newStudioId());
  });

  it('makes an empty track of a kind', () => {
    expect(emptyTrack('audio', 'Audio')).toMatchObject({
      type: 'audio',
      name: 'Audio',
      clips: [],
      locked: false,
    });
  });

  it('starts a project upright, empty, with only its main track', () => {
    const p = newBlankProject('Mine', (k) => k);
    expect(p).toMatchObject({
      name: 'Mine',
      duration: 0,
      fps: STUDIO_FPS,
      aspectRatio: '9:16',
      resolution: { width: 1080, height: 1920 },
    });
    expect(p.tracks).toEqual([
      expect.objectContaining({ type: 'video', name: 'studio.tracks.video' }),
    ]);
  });
});

describe('trimming an animated clip', () => {
  const animatedClip = () =>
    ({
      id: 'a',
      type: 'video',
      trackId: 'v',
      startAt: 0,
      duration: 4,
      fileUrl: 'blob:a',
      file: null,
      mediaStart: 0,
      sourceDuration: 10,
      speed: 1,
      volume: 1,
      muted: false,
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
      keyframes: {
        x: [
          { t: 1, v: 0 },
          { t: 3, v: 100 },
        ],
      },
    }) as MediaClip;

  it('holds at the new start the value shown there before', () => {
    const trimmed = trimmedClip(animatedClip(), 'start', 2) as MediaClip;
    // At 2 s the eased value was 50; it is now the first keyframe.
    expect(trimmed.keyframes?.x).toEqual([
      { t: 0, v: 50 },
      { t: 1, v: 100 },
    ]);
  });

  it('holds at the new end the value shown there before', () => {
    const trimmed = trimmedClip(animatedClip(), 'end', -2) as MediaClip;
    expect(trimmed.keyframes?.x).toEqual([
      { t: 1, v: 0 },
      { t: 2, v: 50 },
    ]);
  });
});
