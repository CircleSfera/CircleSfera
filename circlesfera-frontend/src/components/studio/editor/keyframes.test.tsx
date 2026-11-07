import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import {
  effectClip,
  mediaClip,
  openStudioProject,
  studioClip,
  studioTrack,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import type { MediaClip } from '../../../types/studio';
import ClipVolumePanel from '../panels/ClipVolumePanel';
import ColorPanel from '../panels/ColorPanel';
import EditorTimeline from './EditorTimeline';
import EditorTransport from './EditorTransport';

const store = () => useStudioStore.getState();
const open = (selectedClipId: string | null = 'a', playhead = 1) =>
  openStudioProject(
    [
      studioTrack('v1', 'video', [mediaClip('a', { startAt: 0, duration: 4 })]),
      studioTrack('fx1', 'effect', [
        effectClip('fx', { startAt: 0, duration: 2 }),
      ]),
    ],
    { selectedClipId, playhead },
  );

describe('the keyframe button', () => {
  beforeEach(() => open());

  it('adds a keyframe at the playhead for the chosen clip, and takes it away', () => {
    renderWithProviders(<EditorTransport />);
    const button = screen.getByRole('button', { name: 'Add keyframe' });
    fireEvent.click(button);
    expect(studioClip('a').keyframes?.x).toEqual([{ t: 1, v: 0 }]);
    expect(
      screen.getByRole('button', { name: 'Remove keyframe' }),
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove keyframe' }));
    expect(studioClip('a').keyframes).toBeUndefined();
    expect(store().past).toHaveLength(2);
  });

  it('cannot add one off the clip, and is not there for an effect or with nothing chosen', () => {
    act(() => store().setPlayhead(9));
    const view = renderWithProviders(<EditorTransport />);
    expect(screen.getByRole('button', { name: 'Add keyframe' })).toBeDisabled();
    act(() => store().toggleKeyframe('a'));
    expect(studioClip('a').keyframes).toBeUndefined();
    act(() => store().selectClip('fx'));
    expect(
      screen.queryByRole('button', { name: 'Add keyframe' }),
    ).not.toBeInTheDocument();
    act(() => store().selectClip(null));
    expect(
      screen.queryByRole('button', { name: 'Add keyframe' }),
    ).not.toBeInTheDocument();
    view.unmount();
    act(() => store().toggleKeyframe('nothing'));
  });
});

describe('editing an animated clip', () => {
  beforeEach(() => {
    open('a', 0);
    act(() => store().toggleKeyframe('a'));
    act(() => store().setPlayhead(3));
  });

  it('turns a change at the playhead into a keyframe there, keeping the rest', () => {
    renderWithProviders(<ColorPanel />);
    fireEvent.change(screen.getByRole('slider', { name: /Warmth/ }), {
      target: { value: '60' },
    });
    const clip = studioClip('a');
    expect(clip.keyframes?.warmth).toEqual([
      { t: 0, v: 0 },
      { t: 3, v: 60 },
    ]);
    // The clip's own value stays: only the keyframe holds the change.
    expect(clip.color?.warmth ?? 0).toBe(0);
    // Halfway it shows part of the change.
    act(() => store().setPlayhead(1.5));
    expect(screen.getByRole('slider', { name: /Warmth/ })).toHaveValue('30');
  });

  it('shows the animated volume in its panel', () => {
    act(() => store().updateClip('a', { volume: 1.5 } as Partial<MediaClip>));
    renderWithProviders(<ClipVolumePanel />);
    expect(screen.getByText('150%')).toBeInTheDocument();
    act(() => store().setPlayhead(0));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shares its keyframes out between the halves of a cut', () => {
    act(() => store().updateClip('a', { opacity: 0 } as Partial<MediaClip>));
    act(() => store().setPlayhead(1.5));
    act(() => store().splitClip());
    const [first, second] = (store().project?.tracks[0].clips ??
      []) as MediaClip[];
    expect(first.keyframes?.opacity?.at(-1)).toEqual({ t: 1.5, v: 0.5 });
    expect(second.keyframes?.opacity?.[0]).toEqual({ t: 0, v: 0.5 });
  });

  it('marks its keyframes on the timeline', () => {
    act(() => store().setPlayhead(2));
    act(() => store().toggleKeyframe('a'));
    renderWithProviders(<EditorTimeline onAddMedia={() => {}} />);
    const marks = document.querySelectorAll(
      '[data-studio-clip="a"] [data-studio-keyframe]',
    );
    expect([...marks].map((m) => (m as HTMLElement).style.left)).toEqual([
      '0px',
      '20px',
    ]);
  });
});
