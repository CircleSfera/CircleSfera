import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import {
  mediaClip,
  openStudioProject,
  studioClip,
  studioTrack,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import EditorTransport from '../editor/EditorTransport';
import CurvePanel from './CurvePanel';

const studioPro = vi.hoisted(() => ({ pro: true }));
vi.mock('../../../services/edits.service', () => ({
  editsService: { getStudioPro: vi.fn(async () => ({ ...studioPro })) },
}));

const store = () => useStudioStore.getState();

// A clip with keyframes at 1 s and 3 s, and the playhead on the first.
const open = () => {
  openStudioProject(
    [studioTrack('v1', 'video', [mediaClip('a', { startAt: 0, duration: 4 })])],
    { selectedClipId: 'a', playhead: 1 },
  );
  act(() => store().toggleKeyframe('a'));
  act(() => store().setPlayhead(3));
  act(() => store().toggleKeyframe('a'));
  act(() => store().setPlayhead(1));
};

describe('the curve of a keyframe', () => {
  beforeEach(() => {
    studioPro.pro = true;
    open();
  });

  it('opens from the transport only on a keyframe', () => {
    const view = renderWithProviders(<EditorTransport />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Curve to the next keyframe' }),
    );
    expect(store().openSheet).toBe('curve');
    view.unmount();

    act(() => store().setPlayhead(2));
    renderWithProviders(<EditorTransport />);
    expect(
      screen.queryByRole('button', { name: 'Curve to the next keyframe' }),
    ).not.toBeInTheDocument();
  });

  it('with Pro, sets a named curve on every value of that keyframe, in one step of undo', async () => {
    renderWithProviders(<CurvePanel />);
    const bounce = await screen.findByRole('button', { name: /Bounce/ });
    await vi.waitFor(() => expect(bounce).toBeEnabled());
    fireEvent.click(bounce);
    const frames = studioClip('a').keyframes ?? {};
    expect(frames.x?.[0]).toEqual({ t: 1, v: 0, curve: 'bounce' });
    expect(frames.opacity?.[0].curve).toBe('bounce');
    // The keyframe at 3 s is not touched.
    expect(frames.x?.[1].curve).toBeUndefined();
    expect(screen.getByRole('button', { name: /Bounce/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    act(() => store().undo());
    expect(studioClip('a').keyframes?.x?.[0].curve).toBeUndefined();
  });

  it('with Pro, draws a curve of one own from its control points; ease in and out stores none', async () => {
    renderWithProviders(<CurvePanel />);
    const y2 = await screen.findByRole('slider', {
      name: 'Control point y2',
    });
    await vi.waitFor(() => expect(y2).toBeEnabled());
    fireEvent.change(y2, { target: { value: '1.5' } });
    expect(studioClip('a').keyframes?.x?.[0].curve).toEqual({
      bezier: [0.25, 0.1, 0.25, 1.5],
    });
    fireEvent.click(screen.getByRole('button', { name: /Ease in and out/ }));
    expect(studioClip('a').keyframes?.x?.[0]).toEqual({ t: 1, v: 0 });
  });

  it('without Pro, keeps ease in and out free and locks the rest, leaving a curve already there', async () => {
    studioPro.pro = false;
    act(() => store().setKeyframeCurve('a', 'elastic'));
    renderWithProviders(<CurvePanel />);
    expect(await screen.findByTestId('curves-pro-note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Linear/ })).toBeDisabled();
    expect(
      screen.getByRole('slider', { name: 'Control point x1' }),
    ).toBeDisabled();
    // The curve chosen before stays.
    expect(screen.getByRole('button', { name: /Elastic/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /Ease in and out/ }));
    expect(studioClip('a').keyframes?.x?.[0].curve).toBeUndefined();
  });

  it('asks to stand on a keyframe when the playhead is between them', () => {
    act(() => store().setPlayhead(2));
    renderWithProviders(<CurvePanel />);
    expect(
      screen.getByText('Move the playhead onto a keyframe of the chosen clip.'),
    ).toBeInTheDocument();
    // The store changes nothing off a keyframe either.
    act(() => store().setKeyframeCurve('a', 'linear'));
    expect(studioClip('a').keyframes?.x?.[0].curve).toBeUndefined();
  });
});
