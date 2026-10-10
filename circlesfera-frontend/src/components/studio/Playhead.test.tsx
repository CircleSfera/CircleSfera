import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../stores/studioStore';
import { renderWithProviders } from '../../test/test-utils';
import type { StudioProject } from '../../types/studio';
import Playhead from './Playhead';

const project: StudioProject = {
  id: 'p1',
  name: 'Test',
  tracks: [],
  duration: 10,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('Playhead', () => {
  beforeEach(() => {
    useStudioStore.setState({
      project,
      playhead: 0,
      zoom: 40,
    });
  });

  it('labels the control from the catalog', () => {
    const { i18n } = renderWithProviders(<Playhead />);
    expect(
      screen.getByRole('slider', { name: i18n!.t('studio.playhead') }),
    ).toBeInTheDocument();
    expect(i18n!.t('studio.playhead')).toBe('Playhead');
  });

  it('uses the Spanish playhead label', () => {
    const { i18n } = renderWithProviders(<Playhead />, { lng: 'es' });
    expect(i18n!.t('studio.playhead')).toBe('Cabezal de reproducción');
    expect(
      screen.getByRole('slider', { name: i18n!.t('studio.playhead') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('slider', { name: 'Playhead' }),
    ).not.toBeInTheDocument();
  });

  const playhead = () => useStudioStore.getState().playhead;

  /** The playhead inside a timeline, as the studio shows it. */
  function showOnTimeline(
    state: Partial<ReturnType<typeof useStudioStore.getState>> = {},
  ) {
    useStudioStore.setState(state);
    renderWithProviders(
      <div data-studio-timeline>
        <Playhead />
      </div>,
    );
    const handle = screen.getByRole('slider');
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    return handle;
  }

  describe('the time it shows', () => {
    it.each([
      [0, '00:00.00'],
      [0.3, '00:00.09'],
      [1.5, '00:01.15'],
      [75.1, '01:15.03'],
    ])('reads second %s as minutes, seconds and frames', (at, shown) => {
      showOnTimeline({ playhead: at });
      expect(screen.getByText(shown)).toBeInTheDocument();
    });

    it('counts thirty frames a second for a project saved without a rate', () => {
      showOnTimeline({ project: { ...project, fps: 0 }, playhead: 0.5 });
      expect(screen.getByText('00:00.15')).toBeInTheDocument();
    });
  });

  describe('dragging it', () => {
    // Time zero sits 64 px from the left edge; the zoom is 40 px a second.
    it('stops playback and moves to where it is pressed', () => {
      const handle = showOnTimeline({ isPlaying: true });

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 164 });

      expect(playhead()).toBe(2.5);
      expect(useStudioStore.getState().isPlaying).toBe(false);
      expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('follows the pointer while pressed and lets go on release', () => {
      const handle = showOnTimeline();

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 64 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 264 });
      expect(playhead()).toBe(5);

      fireEvent.pointerUp(handle, { pointerId: 1 });
      expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 104 });
      expect(playhead()).toBe(5);
    });

    it('lets go when the press is interrupted', () => {
      const handle = showOnTimeline();
      handle.hasPointerCapture = vi.fn(() => false);

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 104 });
      fireEvent.pointerCancel(handle, { pointerId: 1 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 264 });

      expect(playhead()).toBe(1);
      expect(handle.releasePointerCapture).not.toHaveBeenCalled();
    });

    it('does not move without a press', () => {
      const handle = showOnTimeline({ playhead: 3 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 264 });
      expect(playhead()).toBe(3);
    });

    it('stays between the start and the end of the project', () => {
      const handle = showOnTimeline();

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 });
      expect(playhead()).toBe(0);

      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 5000 });
      expect(playhead()).toBe(10);
    });

    it('counts how far the timeline is scrolled', () => {
      const handle = showOnTimeline();
      const timeline = handle.closest('[data-studio-timeline]') as HTMLElement;
      timeline.scrollLeft = 80;

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 64 });

      expect(playhead()).toBe(2);
    });

    it('stays put when it is not inside a timeline', () => {
      useStudioStore.setState({ playhead: 3 });
      renderWithProviders(<Playhead />);
      const handle = screen.getByRole('slider');
      handle.setPointerCapture = vi.fn();

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 264 });

      expect(playhead()).toBe(3);
    });
  });

  describe('moving it with the keyboard', () => {
    it('steps one frame with the arrows and one second with Shift', () => {
      const handle = showOnTimeline({ playhead: 2 });

      fireEvent.keyDown(handle, { key: 'ArrowRight' });
      expect(playhead()).toBeCloseTo(2 + 1 / 30);

      fireEvent.keyDown(handle, { key: 'ArrowLeft' });
      expect(playhead()).toBeCloseTo(2);

      fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
      expect(playhead()).toBeCloseTo(3);
      fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
      expect(playhead()).toBeCloseTo(2);
    });

    it('stops at the start and at the end', () => {
      const handle = showOnTimeline({ playhead: 0 });
      fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
      expect(playhead()).toBe(0);

      act(() => useStudioStore.setState({ playhead: 9.5 }));
      fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
      expect(playhead()).toBe(10);
    });

    it('leaves other keys alone', () => {
      const handle = showOnTimeline({ playhead: 2 });
      fireEvent.keyDown(handle, { key: 'ArrowUp' });
      expect(playhead()).toBe(2);
    });

    it('tells assistive technology where it is and how far it can go', () => {
      const handle = showOnTimeline({ playhead: 4 });
      expect(handle).toHaveAttribute('aria-valuenow', '4');
      expect(handle).toHaveAttribute('aria-valuemax', '10');
      expect(handle).toHaveAttribute('aria-valuemin', '0');
    });
  });
});
