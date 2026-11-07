import { describe, expect, it } from 'vitest';
import { mediaClip, studioProject, studioTrack } from '../test/studio-fixtures';
import type { ClipTransition, MediaClip } from '../types/studio';
import {
  duplicateClip,
  mainClips,
  mainTrackEnd,
  moveMainClip,
  packMainTrack,
} from './studioTimeline';
import {
  DEFAULT_TRANSITION_SEC,
  fittedTransition,
  MAX_TRANSITION_SEC,
  transitionProgress,
  withCutFades,
  withoutTransition,
  withTransition,
} from './studioTransitions';

const fade = (duration = DEFAULT_TRANSITION_SEC): ClipTransition => ({
  kind: 'crossfade',
  duration,
});
const clip = (id: string, duration: number, over: Partial<MediaClip> = {}) =>
  mediaClip(id, { startAt: 0, duration, ...over });
const withMain = (clips: MediaClip[]) =>
  packMainTrack(studioProject([studioTrack('v1', 'video', clips)]));
const starts = (project: ReturnType<typeof withMain>) =>
  mainClips(project).map((c) => c.startAt);

describe('fitting a transition between two clips', () => {
  it('keeps it when both clips are long enough', () => {
    const t = fade(1);
    expect(fittedTransition(t, clip('a', 4), clip('b', 4))).toBe(t);
  });

  it('is never longer than half the shorter clip, nor than the longest allowed', () => {
    expect(fittedTransition(fade(1.5), clip('a', 4), clip('b', 1.3))).toEqual(
      fade(0.6),
    );
    expect(fittedTransition(fade(9), clip('a', 10), clip('b', 10))).toEqual(
      fade(MAX_TRANSITION_SEC),
    );
  });

  it('goes when it would be shorter than the shortest, or there is no next clip', () => {
    expect(fittedTransition(fade(1), clip('a', 0.15), clip('b', 4))).toBe(
      undefined,
    );
    expect(fittedTransition(fade(1), clip('a', 4), undefined)).toBe(undefined);
    expect(fittedTransition(undefined, clip('a', 4), clip('b', 4))).toBe(
      undefined,
    );
  });
});

describe('the main track with transitions', () => {
  it('overlaps the clips by each transition, and the video gets shorter', () => {
    const project = withMain([
      clip('a', 4, { transitionOut: fade(0.5) }),
      clip('b', 4, { startAt: 4, transitionOut: fade(1) }),
      clip('c', 4, { startAt: 8 }),
    ]);
    expect(starts(project)).toEqual([0, 3.5, 6.5]);
    expect(mainTrackEnd(project)).toBe(10.5);
  });

  it('shortens a transition a trimmed clip no longer fits, and drops the last clip’s', () => {
    const project = withMain([
      clip('a', 4, { transitionOut: fade(1.5) }),
      clip('b', 2, { startAt: 4, transitionOut: fade(1) }),
    ]);
    const [a, b] = mainClips(project) as MediaClip[];
    expect(a.transitionOut).toEqual(fade(1));
    expect(b.transitionOut).toBeUndefined();
    expect(starts(project)).toEqual([0, 3]);
  });

  it('leaves a project that needs no change as it is', () => {
    const project = withMain([
      clip('a', 4, { transitionOut: fade() }),
      clip('b', 4, { startAt: 3.5 }),
    ]);
    expect(packMainTrack(project)).toBe(project);
  });

  it('takes the transitions off the cuts a moved clip leaves and lands between', () => {
    const project = withMain([
      clip('a', 4, { transitionOut: fade() }),
      clip('b', 4, { startAt: 4, transitionOut: fade() }),
      clip('c', 4, { startAt: 8, transitionOut: fade() }),
      clip('d', 4, { startAt: 12 }),
    ]);
    const moved = moveMainClip(project, 'b', 2);
    const order = mainClips(moved) as MediaClip[];
    expect(order.map((c) => c.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(order.map((c) => Boolean(c.transitionOut))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('gives a copy the way into the next clip, with a plain cut before it', () => {
    const project = withMain([
      clip('a', 4, { transitionOut: fade() }),
      clip('b', 4, { startAt: 4 }),
    ]);
    const copied = duplicateClip(project, 'a', 'a2', () =>
      studioTrack('x', 'video'),
    );
    const order = mainClips(copied) as MediaClip[];
    expect(order.map((c) => [c.id, c.transitionOut?.duration])).toEqual([
      ['a', undefined],
      ['a2', DEFAULT_TRANSITION_SEC],
      ['b', undefined],
    ]);
  });
});

describe('helpers', () => {
  it('puts a transition on and off a clip', () => {
    const a = clip('a', 4);
    expect(withoutTransition(a)).toBe(a);
    const on = withTransition(a, fade());
    expect(on.transitionOut).toEqual(fade());
    expect('transitionOut' in withoutTransition(on)).toBe(false);
    expect(withTransition(on, undefined)).not.toHaveProperty('transitionOut');
  });

  it('measures how far into a transition a moment is', () => {
    expect(transitionProgress(fade(1), 3, 2.5)).toBe(0);
    expect(transitionProgress(fade(1), 3, 3.25)).toBe(0.25);
    expect(transitionProgress(fade(1), 3, 9)).toBe(1);
    expect(transitionProgress(fade(0), 3, 3)).toBe(1);
  });

  it('fades a clip’s sound over the transitions on either side, unless its own fades are longer', () => {
    const a = clip('a', 4, { transitionOut: fade(0.5) });
    const b = clip('b', 4, { transitionOut: fade(1), fadeOut: 2 });
    const c = clip('c', 4);
    expect(withCutFades([a, b, c], b)).toMatchObject({
      fadeIn: 0.5,
      fadeOut: 2,
    });
    expect(withCutFades([a, b, c], c)).toMatchObject({ fadeIn: 1, fadeOut: 0 });
    const lone = clip('z', 4);
    expect(withCutFades([lone], lone)).toBe(lone);
    expect(withCutFades([a], lone)).toBe(lone);
  });
});
