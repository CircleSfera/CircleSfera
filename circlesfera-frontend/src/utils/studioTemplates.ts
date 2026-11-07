import type {
  AspectRatioType,
  ClipTransition,
  ColorAdjustments,
  EffectClip,
  EffectKind,
  Keyframes,
  MediaClip,
  StudioProject,
} from '../types/studio';
import { resolutionForAspect } from './studioExportHelpers';
import { shiftedKeyframes } from './studioKeyframes';
import { withLengthOfClips } from './studioProject';
import { newBlankProject } from './studioProjects';
import {
  emptyTrack,
  mainClips,
  newStudioId,
  packMainTrack,
} from './studioTimeline';

/*
 * Templates: the timing and look of a video without anyone's media, voice
 * or text. Using one fills its slots with the person's own videos and
 * photos.
 */

/** A slot of a template's main track: how long, how fast, how it looks. */
export interface TemplateSlot {
  duration: number;
  speed: number;
  transitionOut?: ClipTransition;
  filter?: string;
  filterIntensity?: number;
  color?: ColorAdjustments;
  keyframes?: Keyframes;
}

/** An effect of a template, where it is on the timeline. */
export interface TemplateEffect {
  startAt: number;
  duration: number;
  effect: EffectKind;
  intensity: number;
}

/** A song of the audio library, from where its clip starts in it. */
export interface TemplateSong {
  audioId: string;
  url: string;
  title: string;
  mediaStart: number;
  startAt: number;
  duration: number;
}

export interface StudioTemplate {
  version: 1;
  name: string;
  aspectRatio: AspectRatioType;
  slots: TemplateSlot[];
  effects: TemplateEffect[];
  song?: TemplateSong;
}

/** What a template saved among a person's projects carries in its state. */
export interface TemplateState {
  kind: 'template';
  template: StudioTemplate;
}

/** The template a saved state holds, if it holds one. */
export function templateOfState(state: unknown): StudioTemplate | null {
  const s = state as Partial<TemplateState> | null;
  return s?.kind === 'template' &&
    s.template?.version === 1 &&
    Array.isArray(s.template.slots)
    ? s.template
    : null;
}

/** How long a template's video lasts, its transitions overlapping. */
export function templateLength(template: StudioTemplate): number {
  return template.slots.reduce(
    (sum, slot, i) =>
      sum +
      slot.duration -
      (i < template.slots.length - 1 ? (slot.transitionOut?.duration ?? 0) : 0),
    0,
  );
}

/**
 * The template of a project: its main track's slots, its effects and its
 * library song. None of its media, voice, text or uploaded sound.
 */
export function templateOf(
  project: StudioProject,
  name: string,
): StudioTemplate {
  const slots: TemplateSlot[] = mainClips(project)
    .filter((c): c is MediaClip => c.type === 'video' || c.type === 'image')
    .map((clip) => ({
      duration: clip.duration,
      speed: clip.speed || 1,
      ...(clip.transitionOut ? { transitionOut: clip.transitionOut } : {}),
      ...(clip.filter ? { filter: clip.filter } : {}),
      ...(clip.filterIntensity !== undefined
        ? { filterIntensity: clip.filterIntensity }
        : {}),
      ...(clip.color ? { color: clip.color } : {}),
      ...(clip.keyframes ? { keyframes: clip.keyframes } : {}),
    }));
  const effects: TemplateEffect[] = project.tracks
    .filter((t) => t.type === 'effect')
    .flatMap((t) => t.clips as EffectClip[])
    .map(({ startAt, duration, effect, intensity }) => ({
      startAt,
      duration,
      effect,
      intensity,
    }));
  const song = project.tracks
    .filter((t) => t.type === 'audio' && !t.muted)
    .flatMap((t) => t.clips as MediaClip[])
    .filter((c) => c.audioId && !c.muted)
    .sort((a, b) => a.startAt - b.startAt)[0];
  return {
    version: 1,
    name,
    aspectRatio: project.aspectRatio,
    slots,
    effects,
    ...(song?.audioId
      ? {
          song: {
            audioId: song.audioId,
            url: song.fileUrl,
            title: song.label ?? '',
            mediaStart: song.mediaStart,
            startAt: song.startAt,
            duration: song.duration,
          },
        }
      : {}),
  };
}

// Seconds kept to the millisecond, without float noise.
const ms = (n: number) => Math.round(n * 1000) / 1000;

/** A video or photo chosen to fill a slot. */
export interface TemplatePick {
  file: File | null;
  url: string;
  type: 'video' | 'image';
  /** How long a video is, in seconds, when known. */
  sourceDuration?: number;
}

/**
 * A new project from a template, its slots filled in order with what was
 * chosen: each from its start, as long as its slot, or as long as a video
 * has. Slots left without a pick are left out.
 */
export function projectFromTemplate(
  template: StudioTemplate,
  picks: TemplatePick[],
  name: string,
  t: (key: string) => string,
): StudioProject {
  const blank = newBlankProject(name, t);
  const main = blank.tracks[0];
  const filled = template.slots.slice(0, picks.length);
  const clips: MediaClip[] = filled.map((slot, i) => {
    const pick = picks[i];
    const longest =
      pick.type === 'video' && pick.sourceDuration
        ? pick.sourceDuration / slot.speed
        : Number.POSITIVE_INFINITY;
    const duration = ms(Math.min(slot.duration, longest));
    const clip: MediaClip = {
      id: newStudioId(),
      trackId: main.id,
      type: pick.type,
      file: pick.file,
      fileUrl: pick.url,
      startAt: 0,
      duration,
      ...(pick.sourceDuration ? { sourceDuration: pick.sourceDuration } : {}),
      mediaStart: 0,
      speed: slot.speed,
      volume: 1,
      muted: pick.type === 'image',
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
      // The last filled slot passes to nothing.
      ...(slot.transitionOut && i < filled.length - 1
        ? { transitionOut: slot.transitionOut }
        : {}),
      ...(slot.filter ? { filter: slot.filter } : {}),
      ...(slot.filterIntensity !== undefined
        ? { filterIntensity: slot.filterIntensity }
        : {}),
      ...(slot.color ? { color: slot.color } : {}),
      ...(slot.keyframes ? { keyframes: slot.keyframes } : {}),
    };
    // Keyframes past a clip cut shorter go.
    return shiftedKeyframes(clip, 0);
  });
  let project = packMainTrack({
    ...blank,
    aspectRatio: template.aspectRatio,
    resolution: resolutionForAspect(template.aspectRatio),
    tracks: [{ ...main, clips }],
  });
  const end = clips.length
    ? Math.max(...mainClips(project).map((c) => c.startAt + c.duration))
    : 0;
  const effects = template.effects
    .filter((fx) => fx.startAt < end)
    .map((fx) => ({
      ...fx,
      duration: ms(Math.min(fx.duration, end - fx.startAt)),
    }));
  if (effects.length) {
    const track = emptyTrack('effect', t('studio.tracks.effects'));
    project = {
      ...project,
      tracks: [
        ...project.tracks,
        {
          ...track,
          clips: effects.map(
            (fx): EffectClip => ({
              id: newStudioId(),
              type: 'effect',
              trackId: track.id,
              ...fx,
            }),
          ),
        },
      ],
    };
  }
  const song = template.song;
  if (song && song.startAt < end) {
    const track = emptyTrack('audio', t('studio.tracks.audio'));
    const clip: MediaClip = {
      id: newStudioId(),
      trackId: track.id,
      type: 'audio',
      file: null,
      fileUrl: song.url,
      label: song.title,
      audioId: song.audioId,
      startAt: song.startAt,
      duration: ms(Math.min(song.duration, end - song.startAt)),
      mediaStart: song.mediaStart,
      speed: 1,
      volume: 1,
      muted: false,
      transform: { scale: 1, rotation: 0, x: 0, y: 0 },
    };
    project = {
      ...project,
      tracks: [...project.tracks, { ...track, clips: [clip] }],
    };
  }
  return withLengthOfClips(project);
}

/** A template made by CircleSfera, named in the person's language. */
export interface BuiltInTemplate {
  id: string;
  nameKey: string;
  template: StudioTemplate;
}

const slots = (count: number, slot: TemplateSlot): TemplateSlot[] =>
  Array.from({ length: count }, () => ({ ...slot }));

/** The templates CircleSfera offers. */
export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  {
    id: 'quick-cuts',
    nameKey: 'studio.templates.built_in.quick_cuts',
    template: {
      version: 1,
      name: 'quick-cuts',
      aspectRatio: '9:16',
      slots: slots(8, { duration: 0.8, speed: 1 }),
      effects: [],
    },
  },
  {
    id: 'soft-story',
    nameKey: 'studio.templates.built_in.soft_story',
    template: {
      version: 1,
      name: 'soft-story',
      aspectRatio: '9:16',
      slots: slots(4, {
        duration: 3,
        speed: 1,
        transitionOut: { kind: 'crossfade', duration: 0.6 },
        color: {
          brightness: 5,
          contrast: -10,
          saturation: -10,
          warmth: 30,
          exposure: 0,
          sharpness: 0,
        },
      }),
      effects: [],
    },
  },
  {
    id: 'before-after',
    nameKey: 'studio.templates.built_in.before_after',
    template: {
      version: 1,
      name: 'before-after',
      aspectRatio: '9:16',
      slots: [
        {
          duration: 2.5,
          speed: 1,
          filter: 'grayscale(1) contrast(1.2)',
          transitionOut: { kind: 'slideleft', duration: 0.5 },
        },
        { duration: 3, speed: 1 },
      ],
      effects: [],
    },
  },
  {
    id: 'trip',
    nameKey: 'studio.templates.built_in.trip',
    template: {
      version: 1,
      name: 'trip',
      aspectRatio: '9:16',
      slots: slots(6, {
        duration: 1.6,
        speed: 1,
        transitionOut: { kind: 'zoomin', duration: 0.4 },
        // A slow push in on every shot.
        keyframes: {
          scale: [
            { t: 0, v: 1 },
            { t: 1.6, v: 1.15 },
          ],
        },
      }),
      effects: [
        { startAt: 0, duration: 7.6, effect: 'vignette', intensity: 40 },
      ],
    },
  },
];
