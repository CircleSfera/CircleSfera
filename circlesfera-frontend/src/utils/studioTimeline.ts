import type { Clip, MediaClip, StudioProject, Track } from '../types/studio';

/** The speeds a clip can be given, slowest first. */
export const CLIP_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3] as const;
export const MIN_CLIP_SPEED = CLIP_SPEEDS[0];
export const MAX_CLIP_SPEED = CLIP_SPEEDS[CLIP_SPEEDS.length - 1];

/** The loudest a clip can be made, as a share of its own volume. */
export const MAX_CLIP_VOLUME = 2;

/** How long a photo lasts when it is added, in seconds. */
export const PHOTO_CLIP_SEC = 3;

/** How long a text lasts when it is added, in seconds. */
export const TEXT_CLIP_SEC = 3;

/**
 * The main track: the first video track. Its clips play one after another
 * with no gap between them, in the order they are in.
 */
export function mainTrackOf(project: StudioProject): Track | undefined {
  return project.tracks.find((track) => track.type === 'video');
}

export function isOnMainTrack(project: StudioProject, clipId: string): boolean {
  return Boolean(mainTrackOf(project)?.clips.some((c) => c.id === clipId));
}

/** The clips of the main track in the order they play. */
export function mainClips(project: StudioProject): Clip[] {
  const main = mainTrackOf(project);
  if (!main) return [];
  return [...main.clips].sort((a, b) => a.startAt - b.startAt);
}

function withMainClips(project: StudioProject, clips: Clip[]): StudioProject {
  const main = mainTrackOf(project);
  if (!main) return project;
  let at = 0;
  const packed = clips.map((clip) => {
    const placed = clip.startAt === at ? clip : { ...clip, startAt: at };
    at += clip.duration;
    return placed;
  });
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.id === main.id ? { ...track, clips: packed } : track,
    ),
  };
}

/**
 * The project with the clips of its main track laid end to end from the
 * start, in the order they are in: a clip removed, cut shorter or made
 * faster closes its gap.
 */
export function packMainTrack(project: StudioProject): StudioProject {
  const ordered = mainClips(project);
  const main = mainTrackOf(project);
  if (!main) return project;
  const unchanged = ordered.every((clip, index) => {
    const before = ordered[index - 1];
    const at = before ? before.startAt + before.duration : 0;
    return clip.startAt === at && main.clips[index] === clip;
  });
  return unchanged ? project : withMainClips(project, ordered);
}

/** The project with a clip of the main track moved to another place. */
export function moveMainClip(
  project: StudioProject,
  clipId: string,
  toIndex: number,
): StudioProject {
  const ordered = mainClips(project);
  const from = ordered.findIndex((c) => c.id === clipId);
  if (from < 0) return project;
  const to = Math.max(0, Math.min(toIndex, ordered.length - 1));
  if (from === to) return project;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  return withMainClips(project, ordered);
}

/** Where the main track ends, in seconds. */
export function mainTrackEnd(project: StudioProject): number {
  const ordered = mainClips(project);
  const last = ordered[ordered.length - 1];
  return last ? last.startAt + last.duration : 0;
}

/** Whether a stretch of a track is free of clips. */
export function isFreeOnTrack(
  track: Track,
  start: number,
  duration: number,
  ignoreClipId?: string,
): boolean {
  return !track.clips.some(
    (clip) =>
      clip.id !== ignoreClipId &&
      start < clip.startAt + clip.duration &&
      clip.startAt < start + duration,
  );
}

/**
 * The layer a new text or sound goes on: the first of its kind with that
 * stretch free, or a new one when every layer of its kind is taken there.
 */
export function layerFor(
  project: StudioProject,
  type: 'text' | 'audio',
  start: number,
  duration: number,
  newTrack: () => Track,
): { project: StudioProject; trackId: string } {
  const free = project.tracks.find(
    (track) =>
      track.type === type &&
      !track.locked &&
      isFreeOnTrack(track, start, duration),
  );
  if (free) return { project, trackId: free.id };
  const track = newTrack();
  return {
    project: { ...project, tracks: [...project.tracks, track] },
    trackId: track.id,
  };
}

/** The project without the layers left with no clips. */
export function withoutEmptyLayers(project: StudioProject): StudioProject {
  const main = mainTrackOf(project);
  const tracks = project.tracks.filter(
    (track) => track === main || track.clips.length > 0,
  );
  return tracks.length === project.tracks.length
    ? project
    : { ...project, tracks };
}

/**
 * A clip at another speed. It takes the same stretch of its file, so it
 * lasts longer when slower and less when faster.
 */
export function withSpeed(clip: MediaClip, speed: number): MediaClip {
  const next = Math.max(MIN_CLIP_SPEED, Math.min(MAX_CLIP_SPEED, speed));
  const current = clip.speed || 1;
  if (next === current) return clip;
  return {
    ...clip,
    speed: next,
    duration: (clip.duration * current) / next,
  };
}

/**
 * The project with a copy of a clip. On the main track the copy plays
 * right after the clip; on a layer it starts where the clip ends, on the
 * same layer when that stretch is free, or on a new one.
 */
export function duplicateClip(
  project: StudioProject,
  clipId: string,
  newId: string,
  newTrack: (type: Track['type']) => Track,
): StudioProject {
  const track = project.tracks.find((t) =>
    t.clips.some((c) => c.id === clipId),
  );
  const clip = track?.clips.find((c) => c.id === clipId);
  if (!track || !clip) return project;

  if (track === mainTrackOf(project)) {
    const ordered = mainClips(project);
    const index = ordered.findIndex((c) => c.id === clipId);
    ordered.splice(index + 1, 0, { ...clip, id: newId });
    return withMainClips(project, ordered);
  }

  const start = clip.startAt + clip.duration;
  const copy = { ...clip, id: newId, startAt: start } as Clip;
  if (isFreeOnTrack(track, start, clip.duration)) {
    return {
      ...project,
      tracks: project.tracks.map((t) =>
        t.id === track.id
          ? { ...t, clips: [...t.clips, { ...copy, trackId: t.id }] }
          : t,
      ),
    };
  }
  const added = newTrack(track.type);
  return {
    ...project,
    tracks: [
      ...project.tracks,
      { ...added, clips: [{ ...copy, trackId: added.id } as Clip] },
    ],
  };
}

/** The clip and the track it is on. */
export function locateClip(
  project: StudioProject,
  clipId: string,
): { track: Track; clip: Clip } | null {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

/** A new id for a project, a track or a clip. */
export function newStudioId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2);
}

/** An empty track of a kind, named in the language of the person. */
export function emptyTrack(type: Track['type'], name: string): Track {
  return {
    id: newStudioId(),
    type,
    name,
    clips: [],
    muted: false,
    hidden: false,
    locked: false,
  };
}

/** The shortest a clip can be cut to, in seconds. */
export const MIN_CLIP_SEC = 0.5;

/**
 * The clip with one of its edges moved by a stretch of timeline, in
 * seconds. The start edge takes more or less of the beginning of the file
 * and the end stays where it is; the end edge takes more or less of its
 * end. A clip is never cut shorter than half a second, made to start
 * before the timeline does, or made to show more than its file has.
 */
export function trimmedClip(
  clip: Clip,
  edge: 'start' | 'end',
  by: number,
): Clip {
  const media = clip.type === 'text' ? null : (clip as MediaClip);
  const speed = media?.speed || 1;
  // Photos and texts can last as long as wanted; a video or a sound only
  // as long as its file.
  const bounded = media && media.type !== 'image';
  if (edge === 'start') {
    const earliest = Math.max(
      -clip.startAt,
      bounded ? -(media as MediaClip).mediaStart / speed : -Infinity,
    );
    const moved = Math.min(
      Math.max(by, earliest),
      clip.duration - MIN_CLIP_SEC,
    );
    const next = {
      ...clip,
      startAt: clip.startAt + moved,
      duration: clip.duration - moved,
    };
    if (media)
      (next as MediaClip).mediaStart = media.mediaStart + moved * speed;
    return next as Clip;
  }
  let duration = Math.max(MIN_CLIP_SEC, clip.duration + by);
  if (bounded && media?.sourceDuration) {
    duration = Math.min(
      duration,
      (media.sourceDuration - media.mediaStart) / speed,
    );
  } else if (bounded) {
    // A clip saved before the length of its file was kept can be cut
    // shorter, not made longer: how much more the file has is unknown.
    duration = Math.min(duration, Math.max(clip.duration, MIN_CLIP_SEC));
  }
  return { ...clip, duration } as Clip;
}
