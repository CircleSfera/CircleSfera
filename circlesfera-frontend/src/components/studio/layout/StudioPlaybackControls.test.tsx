import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import { renderWithProviders } from '../../../test/test-utils';
import type { StudioProject } from '../../../types/studio';
import StudioPlaybackControls from './StudioPlaybackControls';

const project: StudioProject = {
  id: 'p1',
  name: 'Edit',
  tracks: [],
  duration: 75.5,
  fps: 10,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  createdAt: '',
  updatedAt: '',
};

const store = () => useStudioStore.getState();
const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

function show(playhead = 0, isPlaying = false) {
  useStudioStore.setState({ project, playhead, isPlaying });
  return renderWithProviders(<StudioPlaybackControls />);
}

describe('StudioPlaybackControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    useStudioStore.setState({ project: null, playhead: 0, isPlaying: false });
  });

  it('shows where the playhead is and how long the project is, to the frame', () => {
    show(65.3);

    // At ten frames a second, 0.3 s is frame three.
    expect(screen.getByText('01:05.03')).toBeInTheDocument();
    expect(screen.getByText('/ 01:15.05')).toBeInTheDocument();
  });

  it('plays and pauses', () => {
    show();

    press('Play');
    expect(store().isPlaying).toBe(true);

    press('Pause');
    expect(store().isPlaying).toBe(false);
  });

  it('steps one frame back and forward, pausing', () => {
    show(5, true);

    press('Next frame');
    expect(store().playhead).toBeCloseTo(5.1);
    expect(store().isPlaying).toBe(false);

    press('Previous frame');
    expect(store().playhead).toBeCloseTo(5);
  });

  it('does not step before the start or past the end', () => {
    show(0);
    press('Previous frame');
    expect(store().playhead).toBe(0);

    act(() => useStudioStore.setState({ playhead: 75.5 }));
    press('Next frame');
    expect(store().playhead).toBe(75.5);
  });

  it('jumps to the start and to the end', () => {
    show(30);

    press('Go to end');
    expect(store().playhead).toBe(75.5);

    press('Go to start');
    expect(store().playhead).toBe(0);
  });

  describe('full screen', () => {
    const preview = () => {
      const el = document.createElement('div');
      el.setAttribute('data-studio-preview', '');
      el.requestFullscreen = vi.fn().mockResolvedValue(undefined);
      document.body.appendChild(el);
      return el;
    };

    afterEach(() => {
      document.querySelector('[data-studio-preview]')?.remove();
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: null,
      });
    });

    it('opens the preview in full screen', () => {
      const el = preview();
      show();

      press('Fullscreen');

      expect(el.requestFullscreen).toHaveBeenCalledTimes(1);
    });

    it('leaves full screen when it is already on', () => {
      const el = preview();
      document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: el,
      });
      show();

      press('Fullscreen');

      expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
      expect(el.requestFullscreen).not.toHaveBeenCalled();
    });

    it('does nothing when there is no preview on screen', () => {
      show();

      expect(() => press('Fullscreen')).not.toThrow();
    });
  });
});
