import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import {
  effectClip,
  mediaClip,
  openStudioProject,
  studioClip,
  studioTrack,
  textClip,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import type { EffectClip, MediaClip } from '../../../types/studio';
import {
  DEFAULT_EFFECT_INTENSITY,
  EFFECT_CLIP_SEC,
} from '../../../utils/studioEffects';
import { DEFAULT_TRANSITION_SEC } from '../../../utils/studioTransitions';
import ColorPanel from './ColorPanel';
import EffectsPanel from './EffectsPanel';
import TransitionPanel from './TransitionPanel';

const store = () => useStudioStore.getState();
const three = (over: Partial<MediaClip> = {}) =>
  studioTrack('v1', 'video', [
    mediaClip('a', { startAt: 0, duration: 4, ...over }),
    mediaClip('b', { startAt: 4, duration: 4 }),
    mediaClip('c', { startAt: 8, duration: 4 }),
  ]);

describe('the transitions of a cut', () => {
  beforeEach(() => {
    openStudioProject([three()]);
    act(() => store().selectCut('a'));
  });

  it('puts a transition on the cut, the next clip starting earlier, in one step of undo', () => {
    renderWithProviders(<TransitionPanel />);
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fade through black' }));
    expect(studioClip('a').transitionOut).toEqual({
      kind: 'fadeblack',
      duration: DEFAULT_TRANSITION_SEC,
    });
    expect(studioClip('b').startAt).toBe(4 - DEFAULT_TRANSITION_SEC);
    expect(store().past).toHaveLength(1);
    act(() => store().undo());
    expect(studioClip('a').transitionOut).toBeUndefined();
  });

  it('sets its length up to half the shorter clip, and takes it away', () => {
    renderWithProviders(<TransitionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Crossfade' }));
    const slider = screen.getByRole('slider', { name: /Length/ });
    expect(slider).toHaveAttribute('max', '1.5');
    fireEvent.change(slider, { target: { value: '1.2' } });
    expect(studioClip('a').transitionOut?.duration).toBe(1.2);
    expect(studioClip('b').startAt).toBeCloseTo(2.8);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(studioClip('a').transitionOut).toBeUndefined();
    expect(studioClip('b').startAt).toBe(4);
  });

  it('applies the same to every cut', () => {
    renderWithProviders(<TransitionPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Slide up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all' }));
    expect(studioClip('b').transitionOut?.kind).toBe('slideup');
    // The last clip has no cut after it.
    expect(studioClip('c').transitionOut).toBeUndefined();
  });

  it('says when the clips are too short for one', () => {
    openStudioProject([
      studioTrack('v1', 'video', [
        mediaClip('a', { startAt: 0, duration: 0.15 }),
        mediaClip('b', { startAt: 0.15, duration: 4 }),
      ]),
    ]);
    act(() => store().selectCut('a'));
    renderWithProviders(<TransitionPanel />);
    expect(screen.getByText(/too short for a transition/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crossfade' })).toBeDisabled();
  });

  it('shows nothing without a cut, or for the last clip', () => {
    act(() => store().selectCut(null));
    const first = renderWithProviders(<TransitionPanel />);
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    act(() => store().selectCut('c'));
    const last = renderWithProviders(<TransitionPanel />);
    expect(last.container).toBeEmptyDOMElement();
  });

  it('lets go of a cut that undo takes away, and closes its panel', () => {
    openStudioProject([three()], { selectedClipId: 'c' });
    act(() => store().duplicateSelected((type) => studioTrack('n', type)));
    act(() => store().selectCut('c'));
    expect(store().openSheet).toBe('transition');
    // Without the copy, the last clip has no cut after it.
    act(() => store().undo());
    expect(store().selectedCut).toBeNull();
    expect(store().openSheet).toBeNull();
  });
});

describe('effects', () => {
  beforeEach(() => {
    openStudioProject([three()], { playhead: 10 });
    useStudioStore.setState((s) => ({
      project: s.project ? { ...s.project, duration: 12 } : null,
    }));
  });

  it('adds an effect at the playhead, on an effects layer, for the time left', () => {
    renderWithProviders(<EffectsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Vignette' }));
    const layer = store().project?.tracks.find((t) => t.type === 'effect');
    expect(layer?.name).toBe('Effects');
    const added = layer?.clips[0] as EffectClip;
    expect(added).toMatchObject({
      type: 'effect',
      effect: 'vignette',
      intensity: DEFAULT_EFFECT_INTENSITY,
      startAt: 10,
      duration: Math.min(EFFECT_CLIP_SEC, 2),
    });
    expect(store()).toMatchObject({
      selectedClipId: added.id,
      openSheet: 'effect',
    });
  });

  it('changes the chosen effect’s intensity and kind, keeping its time', () => {
    openStudioProject(
      [three(), studioTrack('fx1', 'effect', [effectClip('fx')])],
      { selectedClipId: 'fx' },
    );
    renderWithProviders(<EffectsPanel />);
    fireEvent.change(screen.getByRole('slider', { name: /Intensity/ }), {
      target: { value: '80' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Shake' }));
    expect(studioClip<EffectClip>('fx')).toMatchObject({
      effect: 'shake',
      intensity: 80,
      startAt: 2,
      duration: 3,
    });
    expect(screen.getByRole('button', { name: 'Shake' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(store().past).toHaveLength(2);
  });
});

describe('picture adjustments', () => {
  it('sets each one, back to 0 with a double tap, and all at once with reset', () => {
    openStudioProject([three()], { selectedClipId: 'a' });
    renderWithProviders(<ColorPanel />);
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(reset).toBeDisabled();
    const warmth = screen.getByRole('slider', { name: /Warmth/ });
    fireEvent.change(warmth, { target: { value: '30' } });
    fireEvent.change(screen.getByRole('slider', { name: /Contrast/ }), {
      target: { value: '-20' },
    });
    expect(studioClip('a').color).toMatchObject({ warmth: 30, contrast: -20 });
    expect(screen.getByText('+30')).toBeInTheDocument();
    fireEvent.doubleClick(warmth);
    expect(studioClip('a').color?.warmth).toBe(0);
    fireEvent.click(reset);
    expect(studioClip('a').color?.contrast).toBe(0);
  });

  it('shows nothing for a text or a sound', () => {
    openStudioProject(
      [three(), studioTrack('t1', 'text', [textClip('words')])],
      { selectedClipId: 'words' },
    );
    const view = renderWithProviders(<ColorPanel />);
    expect(view.container).toBeEmptyDOMElement();
  });
});
