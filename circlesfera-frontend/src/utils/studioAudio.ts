import type { Clip, MediaClip, StudioProject, Track } from '../types/studio';
import { locateClip, newStudioId } from './studioTimeline';

/** The longest fade in or out of a clip, in seconds. */
export const MAX_FADE_SEC = 3;
/** The steps a fade is set in, in seconds. */
export const FADE_STEP_SEC = 0.1;
/** How much other sound drops while a voice speaks, in decibels. */
export const DUCK_DB = -12;
/** The same drop, as a share of the sound's level. */
export const DUCK_GAIN = 10 ** (DUCK_DB / 20);
/** How long the drop and the return take, in seconds. */
export const DUCK_RAMP_SEC = 0.2;

/** Whether a track carries sound only: music and sounds, or voice. */
export function isSoundTrack(track: Track): boolean {
  return track.type === 'audio' || track.type === 'voice';
}

/** Whether a project lowers other sound under a voice (on unless turned off). */
export function ducksUnderVoice(project: StudioProject): boolean {
  return project.duckUnderVoice !== false;
}

/** A fade length within its limits, on its steps. */
export function clampFade(seconds: number, clipDuration: number): number {
  const most = Math.min(MAX_FADE_SEC, clipDuration / 2);
  const stepped = Math.round(seconds / FADE_STEP_SEC) * FADE_STEP_SEC;
  return Math.max(0, Math.min(most, Number(stepped.toFixed(1))));
}

/** How loud a clip's fades leave it at a moment of the timeline, 0 to 1. */
export function fadeGainAt(clip: MediaClip, t: number): number {
  const into = t - clip.startAt;
  const left = clip.startAt + clip.duration - t;
  if (into < 0 || left < 0) return 0;
  let gain = 1;
  if (clip.fadeIn) gain = Math.min(gain, into / clip.fadeIn);
  if (clip.fadeOut) gain = Math.min(gain, left / clip.fadeOut);
  return Math.max(0, Math.min(1, gain));
}

/** When a voice is heard: the stretches of the clips on voice layers. */
export function voiceSpans(project: StudioProject): [number, number][] {
  return project.tracks
    .filter((t) => t.type === 'voice' && !t.muted)
    .flatMap((t) => t.clips)
    .filter((c) => !(c as MediaClip).muted)
    .map((c) => [c.startAt, c.startAt + c.duration] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * How much of its level other sound keeps at a moment: all of it with no
 * voice, the duck level under one, and a short ramp either side.
 */
export function duckGainAt(spans: [number, number][], t: number): number {
  let under = 0;
  for (const [start, end] of spans) {
    const ramp = Math.min(
      (t - (start - DUCK_RAMP_SEC)) / DUCK_RAMP_SEC,
      (end + DUCK_RAMP_SEC - t) / DUCK_RAMP_SEC,
    );
    under = Math.max(under, Math.max(0, Math.min(1, ramp)));
  }
  return 1 - (1 - DUCK_GAIN) * under;
}

/**
 * How loud a clip plays at a moment: its volume, its fades, and the drop
 * under a voice when it is not a voice itself.
 */
export function clipGainAt(
  project: StudioProject,
  clip: MediaClip,
  t: number,
  isVoice: boolean,
): number {
  if (clip.muted) return 0;
  const ducked =
    !isVoice && ducksUnderVoice(project)
      ? duckGainAt(voiceSpans(project), t)
      : 1;
  return (clip.volume ?? 1) * fadeGainAt(clip, t) * ducked;
}

/** The ffmpeg filters of a clip's fades, in its own time from 0. */
export function fadeFilters(clip: MediaClip): string[] {
  const parts: string[] = [];
  if (clip.fadeIn) parts.push(`afade=t=in:st=0:d=${clip.fadeIn}`);
  if (clip.fadeOut) {
    const start = Math.max(0, clip.duration - clip.fadeOut);
    parts.push(`afade=t=out:st=${start}:d=${clip.fadeOut}`);
  }
  return parts;
}

/**
 * The ffmpeg filter that lowers a sound under the voices, in the timeline's
 * time; none with no voice. The same ramps as the preview.
 */
export function duckFilter(spans: [number, number][]): string | null {
  if (spans.length === 0) return null;
  const r = DUCK_RAMP_SEC;
  const ramps = spans.map(
    ([a, b]) => `clip(min((t-${a - r})/${r}\\,(${b + r}-t)/${r})\\,0\\,1)`,
  );
  const under = ramps.reduce((acc, next) => `max(${acc}\\,${next})`);
  const loss = (1 - DUCK_GAIN).toFixed(4);
  return `volume='1-${loss}*${under}':eval=frame`;
}

/**
 * The project with a video's sound taken out onto a sound layer: the same
 * file, the same stretch of it, at the same time; the video is then silent.
 */
export function withDetachedSound(
  project: StudioProject,
  clipId: string,
  newTrack: () => Track,
): { project: StudioProject; soundId: string } | null {
  const found = locateClip(project, clipId);
  if (found?.clip.type !== 'video') return null;
  const video = found.clip as MediaClip;
  const soundId = newStudioId();
  const free = project.tracks.find(
    (t) =>
      t.type === 'audio' &&
      !t.locked &&
      !t.clips.some(
        (c) =>
          video.startAt < c.startAt + c.duration &&
          c.startAt < video.startAt + video.duration,
      ),
  );
  const track = free ?? newTrack();
  const sound: MediaClip = {
    ...video,
    id: soundId,
    type: 'audio',
    trackId: track.id,
    file: null,
    muted: false,
    filter: undefined,
    detachedFrom: video.id,
  };
  const tracks = (free ? project.tracks : [...project.tracks, track]).map(
    (t) => {
      let clips: Clip[] = t.clips.map((c) =>
        c.id === video.id ? ({ ...c, muted: true } as Clip) : c,
      );
      if (t.id === track.id) clips = [...clips, sound];
      return { ...t, clips };
    },
  );
  return { project: { ...project, tracks }, soundId };
}

/**
 * The library song a published video carries, so it counts as used: the
 * first one heard on the timeline, from where its clip starts in the song.
 */
export function librarySongOf(
  project: StudioProject,
): { id: string; startMs: number } | null {
  const song = project.tracks
    .filter((t) => t.type === 'audio' && !t.muted)
    .flatMap((t) => t.clips as MediaClip[])
    .filter((c) => c.audioId && !c.muted && c.volume > 0)
    .sort((a, b) => a.startAt - b.startAt)[0];
  if (!song?.audioId) return null;
  return { id: song.audioId, startMs: Math.round(song.mediaStart * 1000) };
}
