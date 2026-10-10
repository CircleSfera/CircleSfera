import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../stores/studioStore';
import { renderWithProviders } from '../../test/test-utils';
import type { StudioProject, Track } from '../../types/studio';
import Timeline from './Timeline';

vi.mock('./Track', () => ({
  default: ({ track }: { track: Track }) => (
    <div data-testid="track">{track.name}</div>
  ),
}));
vi.mock('./Playhead', () => ({
  default: () => <div data-testid="playhead" />,
}));

const track = (name: string): Track => ({
  id: name,
  type: 'video',
  name,
  clips: [],
  muted: false,
  hidden: false,
  locked: false,
});

const project = (
  duration: number,
  tracks = [track('V1'), track('A1')],
): StudioProject => ({
  id: 'p1',
  name: 'Edit',
  tracks,
  duration,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  createdAt: '',
  updatedAt: '',
});

const store = () => useStudioStore.getState();
const scroller = () =>
  document.querySelector('[data-studio-timeline]') as HTMLElement;
const labels = () =>
  [...document.querySelectorAll('span.font-mono')].map((s) =>
    s.textContent?.replace(/\s/g, ''),
  );

function show(duration = 20, zoom = 10) {
  useStudioStore.setState({
    project: project(duration),
    zoom,
    playhead: 0,
    isPlaying: false,
  });
  return renderWithProviders(<Timeline />);
}

describe('Timeline', () => {
  /** The frame the timeline asked for, to run by hand. */
  let frame: (() => void) | undefined;

  beforeEach(() => {
    frame = undefined;
    vi.stubGlobal('requestAnimationFrame', (next: () => void) => {
      frame = next;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useStudioStore.setState({ project: null });
  });

  it('asks for media when there is no project', () => {
    useStudioStore.setState({ project: null });
    renderWithProviders(<Timeline />);

    expect(screen.getByText('Add media to start editing')).toBeInTheDocument();
  });

  it('shows every track of the project and the playhead', () => {
    show();

    expect(screen.getAllByTestId('track').map((el) => el.textContent)).toEqual([
      'V1',
      'A1',
    ]);
    expect(screen.getByTestId('playhead')).toBeInTheDocument();
  });

  describe('the ruler', () => {
    it('marks every second, as minutes and seconds', () => {
      show(75);

      expect(labels()).toHaveLength(76);
      expect(labels().slice(0, 2)).toEqual(['00:00', '00:01']);
      expect(labels()[59]).toBe('00:59');
      expect(labels()[60]).toBe('01:00');
      expect(labels()[75]).toBe('01:15');
    });

    it('never shows less than ten seconds', () => {
      show(4);

      expect(labels()).toHaveLength(11);
    });

    it('marks the half seconds only when there is room for them', () => {
      const halves = () =>
        document.querySelectorAll('.h-1.bg-white\\/10').length;
      const close = show(12, 40);
      expect(halves()).toBe(12);
      close.unmount();

      show(12, 20);
      expect(halves()).toBe(0);
    });
  });

  describe('a press on the timeline', () => {
    const pressAt = (clientX: number, scrollLeft = 0) => {
      const el = scroller();
      el.getBoundingClientRect = () => ({ left: 10 }) as DOMRect;
      Object.defineProperty(el, 'scrollLeft', {
        configurable: true,
        writable: true,
        value: scrollLeft,
      });
      fireEvent.click(el.firstElementChild as HTMLElement, { clientX });
    };

    it('moves the playhead there, counting the room left of time zero', () => {
      show(20, 10);

      // 10 px of margin, 64 px before time zero, then 50 px at ten a second.
      pressAt(124);

      expect(store().playhead).toBe(5);
    });

    it('counts how far the timeline is scrolled', () => {
      show(60, 10);

      pressAt(124, 200);

      expect(store().playhead).toBe(25);
    });

    it('does not go before the start or past the end', () => {
      show(20, 10);

      pressAt(20);
      expect(store().playhead).toBe(0);

      pressAt(5000);
      expect(store().playhead).toBe(20);
    });
  });

  it('follows the playhead while playing, and never scrolls back', () => {
    show(120, 10);
    const el = scroller();
    Object.defineProperty(el, 'clientWidth', {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(el, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0,
    });

    act(() => useStudioStore.setState({ isPlaying: true, playhead: 50 }));
    act(() => frame?.());
    // The playhead is kept in the middle: 500 px + 32 − half of 300.
    expect(el.scrollLeft).toBe(382);

    act(() => useStudioStore.setState({ playhead: 10 }));
    act(() => frame?.());
    expect(el.scrollLeft).toBe(382);
  });

  it('shows there is more to the right until the end is reached', () => {
    show(120, 10);
    const el = scroller();
    const fades = () =>
      [...document.querySelectorAll('.w-8.pointer-events-none')].map((f) =>
        f.className.includes('opacity-100'),
      );
    Object.defineProperty(el, 'clientWidth', {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(el, 'scrollWidth', {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(el, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: 0,
    });

    fireEvent.scroll(el);
    expect(fades()).toEqual([false, true]);

    el.scrollLeft = 900;
    fireEvent.scroll(el);
    expect(fades()).toEqual([true, false]);
  });
});
