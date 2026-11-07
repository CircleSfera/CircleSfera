import type {
  Clip,
  ClipTransition,
  MediaClip,
  TransitionKind,
} from '../types/studio';

/** The transitions a cut of the main track can take, in the order shown. */
export const TRANSITION_KINDS: readonly TransitionKind[] = [
  'crossfade',
  'fadeblack',
  'slideleft',
  'slideright',
  'slideup',
  'slidedown',
  'zoomin',
  'blur',
];

/** How long a new transition lasts, in seconds. */
export const DEFAULT_TRANSITION_SEC = 0.5;
/** The shortest a transition can be; one cut shorter is removed. */
export const MIN_TRANSITION_SEC = 0.1;
/** The longest a transition can be. */
export const MAX_TRANSITION_SEC = 1.5;
/** The steps its length is set in. */
export const TRANSITION_STEP_SEC = 0.1;

// Seconds rounded to the steps of a transition, without float noise.
const toStep = (seconds: number) =>
  Math.round(
    Math.floor(seconds / TRANSITION_STEP_SEC + 1e-6) * TRANSITION_STEP_SEC * 10,
  ) / 10;

/**
 * The transition as it fits between two clips: never longer than half of
 * either, so a clip is never covered from both sides at once. None when it
 * would be shorter than the shortest a transition can be.
 */
export function fittedTransition(
  transition: ClipTransition | undefined,
  clip: Clip,
  next: Clip | undefined,
): ClipTransition | undefined {
  if (!transition || !next) return undefined;
  const duration = toStep(
    Math.min(
      transition.duration,
      MAX_TRANSITION_SEC,
      clip.duration / 2,
      next.duration / 2,
    ),
  );
  if (duration < MIN_TRANSITION_SEC) return undefined;
  return duration === transition.duration
    ? transition
    : { ...transition, duration };
}

/** The transition a clip passes to the next with, if it is a media clip. */
export function transitionOf(
  clip: Clip | undefined,
): ClipTransition | undefined {
  return clip && (clip.type === 'video' || clip.type === 'image')
    ? (clip as MediaClip).transitionOut
    : undefined;
}

/** The clip without a transition to the next. */
export function withoutTransition<C extends Clip>(clip: C): C {
  if (!transitionOf(clip)) return clip;
  const { transitionOut: _gone, ...rest } = clip as MediaClip;
  return rest as unknown as C;
}

/** The clip with a transition to the next, or with none. */
export function withTransition<C extends Clip>(
  clip: C,
  transition: ClipTransition | undefined,
): C {
  if (!transition) return withoutTransition(clip);
  return { ...clip, transitionOut: transition };
}

/**
 * How far into a transition a moment is, from 0 as it starts to 1 as it
 * ends, given where the incoming clip starts.
 */
export function transitionProgress(
  transition: ClipTransition,
  incomingStart: number,
  t: number,
): number {
  if (transition.duration <= 0) return 1;
  return Math.max(0, Math.min(1, (t - incomingStart) / transition.duration));
}

/** The ffmpeg xfade transition that draws each kind. */
export const XFADE_OF: Record<TransitionKind, string> = {
  crossfade: 'fade',
  fadeblack: 'fadeblack',
  slideleft: 'slideleft',
  slideright: 'slideright',
  slideup: 'slideup',
  slidedown: 'slidedown',
  zoomin: 'zoomin',
  blur: 'hblur',
};

/**
 * A clip of the main track whose sound fades in and out across the
 * transitions on either side of it, over their lengths, unless its own
 * fades are longer.
 */
export function withCutFades(ordered: Clip[], clip: MediaClip): MediaClip {
  const index = ordered.findIndex((c) => c.id === clip.id);
  if (index < 0) return clip;
  const into = transitionOf(ordered[index - 1])?.duration ?? 0;
  const out = transitionOf(clip)?.duration ?? 0;
  if (!into && !out) return clip;
  return {
    ...clip,
    fadeIn: Math.max(clip.fadeIn ?? 0, into),
    fadeOut: Math.max(clip.fadeOut ?? 0, out),
  };
}
