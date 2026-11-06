import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import {
  mediaClip,
  openStudioProject,
  studioTrack,
  textClip,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import type { MediaClip } from '../../../types/studio';
import ClipSpeedPanel from '../panels/ClipSpeedPanel';
import ClipVolumePanel from '../panels/ClipVolumePanel';
import ProjectSettingsPanel from '../panels/ProjectSettingsPanel';
import EditorPanel from './EditorPanel';
import EditorTimeline, { formatClock, rulerStep } from './EditorTimeline';
import EditorTopbar from './EditorTopbar';
import EditorTransport, { formatTimecode } from './EditorTransport';
import { HOLD_TO_MOVE_MS } from './TimelineClip';

// The browser keeps a pointer on the element that took it; jsdom has no
// such thing.
Element.prototype.setPointerCapture = vi.fn();

vi.mock('../layout/PropertiesPanel', () => ({
  default: () => <p>properties</p>,
}));

const store = () => useStudioStore.getState();
const main = () => store().project?.tracks[0].clips as MediaClip[];
const clipButton = (id: string) =>
  document.querySelector(`[data-studio-clip="${id}"] > button`) as HTMLElement;
const handle = (id: string, name: string) =>
  (
    document.querySelector(`[data-studio-clip="${id}"]`) as HTMLElement
  ).querySelector(`[aria-label="${name}"]`) as HTMLElement;

function openTwoClips(zoom = 10) {
  openStudioProject(
    [
      studioTrack('v1', 'video', [
        mediaClip('a', { trackId: 'v1', startAt: 0, duration: 4 }),
        mediaClip('b', { trackId: 'v1', startAt: 4, duration: 6 }),
      ]),
      studioTrack('t1', 'text', [
        textClip('w', { trackId: 't1', startAt: 1, duration: 2 }),
      ]),
    ],
    { zoom },
  );
  useStudioStore.setState((s) => ({
    project: s.project ? { ...s.project, duration: 10 } : null,
  }));
}

describe('the timeline', () => {
  beforeEach(() => {
    vi.useRealTimers();
    openTwoClips();
  });

  it('marks the time more sparsely the further it is zoomed out', () => {
    expect([100, 50, 25, 10].map(rulerStep)).toEqual([1, 2, 5, 10]);
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('shows the main track, the layers with something on them, and a button to add clips', () => {
    const onAdd = vi.fn();
    renderWithProviders(<EditorTimeline onAddMedia={onAdd} />);
    expect(
      document.querySelectorAll('[data-studio-main-track] [data-studio-clip]'),
    ).toHaveLength(2);
    expect(
      document.querySelectorAll(
        '[data-studio-layer="text"] [data-studio-clip]',
      ),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add clips' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('offers to add clips with words when the project is empty', () => {
    openStudioProject([studioTrack('v1', 'video')]);
    renderWithProviders(<EditorTimeline onAddMedia={vi.fn()} />);
    expect(screen.getByText('Add clips')).toBeInTheDocument();
  });

  it('moves the playhead when scrolled by hand, and stops the video', () => {
    useStudioStore.setState({ isPlaying: true });
    renderWithProviders(<EditorTimeline onAddMedia={vi.fn()} />);
    const scroller = document.querySelector(
      '[data-studio-timeline] > div',
    ) as HTMLElement;
    // The first scroll is the timeline following the playhead itself.
    act(() => {
      scroller.scrollLeft = 0;
      fireEvent.scroll(scroller);
    });
    act(() => {
      scroller.scrollLeft = 30;
      fireEvent.scroll(scroller);
    });
    expect(store().playhead).toBe(3);
    expect(store().isPlaying).toBe(false);
  });

  it('still follows a scroll by hand after the playhead was past where it can scroll', () => {
    renderWithProviders(<EditorTimeline onAddMedia={vi.fn()} />);
    const scroller = document.querySelector(
      '[data-studio-timeline] > div',
    ) as HTMLElement;
    // jsdom does not scroll: the position stays where it is, as at a limit.
    Object.defineProperty(scroller, 'scrollLeft', {
      configurable: true,
      get: () => 0,
      set: () => {},
    });
    act(() => store().setPlayhead(9));
    Object.defineProperty(scroller, 'scrollLeft', {
      configurable: true,
      value: 20,
      writable: true,
    });
    act(() => {
      fireEvent.scroll(scroller);
    });
    expect(store().playhead).toBe(2);
  });

  it('follows the playhead when it moves from elsewhere', () => {
    renderWithProviders(<EditorTimeline onAddMedia={vi.fn()} />);
    const scroller = document.querySelector(
      '[data-studio-timeline] > div',
    ) as HTMLElement;
    act(() => store().setPlayhead(5));
    expect(scroller.scrollLeft).toBe(50);
  });

  it('zooms with two fingers and with the wheel and Control', () => {
    renderWithProviders(<EditorTimeline onAddMedia={vi.fn()} />);
    const scroller = document.querySelector(
      '[data-studio-timeline] > div',
    ) as HTMLElement;
    useStudioStore.setState({ zoom: 50 });
    const touches = (gap: number) => [
      { clientX: 0, clientY: 0 },
      { clientX: gap, clientY: 0 },
    ];
    fireEvent.touchStart(scroller, { touches: touches(100) });
    fireEvent.touchMove(scroller, { touches: touches(200) });
    fireEvent.touchEnd(scroller, { touches: [] });
    expect(store().zoom).toBe(100);
    act(() => {
      scroller.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 10,
          ctrlKey: true,
          cancelable: true,
        }),
      );
      scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
    });
    expect(store().zoom).toBe(90);
  });

  it('lets go of the clip when an empty part is tapped', () => {
    useStudioStore.setState({ selectedClipId: 'a' });
    renderWithProviders(<EditorTimeline onAddMedia={vi.fn()} />);
    const canvas = document.querySelector(
      '[data-studio-timeline] > div > div',
    ) as HTMLElement;
    fireEvent.click(canvas);
    expect(store().selectedClipId).toBeNull();
  });
});

describe('a clip on the timeline', () => {
  beforeEach(() => {
    vi.useRealTimers();
    openTwoClips();
    renderWithProviders(<EditorTimeline onAddMedia={vi.fn()} />);
  });

  const tap = (el: HTMLElement, pointerType = 'mouse') => {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 10, pointerType });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 10, pointerType });
  };

  it('is chosen with a tap and let go with another, or from the keyboard', () => {
    tap(clipButton('a'));
    expect(store().selectedClipId).toBe('a');
    tap(clipButton('a'));
    expect(store().selectedClipId).toBeNull();
    fireEvent.keyDown(clipButton('b'), { key: 'Enter' });
    expect(store().selectedClipId).toBe('b');
    fireEvent.keyDown(clipButton('b'), { key: ' ' });
    expect(store().selectedClipId).toBeNull();
    fireEvent.keyDown(clipButton('b'), { key: 'x' });
    expect(store().selectedClipId).toBeNull();
  });

  it('is cut shorter from its end, and the next clip follows', () => {
    act(() => store().selectClip('a'));
    const end = handle('a', 'Trim end');
    fireEvent.pointerDown(end, { pointerId: 2, clientX: 100 });
    fireEvent.pointerMove(end, { pointerId: 2, clientX: 80 });
    fireEvent.pointerUp(end, { pointerId: 2, clientX: 80 });
    expect(main()[0].duration).toBe(2);
    expect(main()[1].startAt).toBe(2);
  });

  it('takes less of the start of its file from its start', () => {
    act(() => store().selectClip('b'));
    const start = handle('b', 'Trim start');
    fireEvent.pointerDown(start, { pointerId: 3, clientX: 0 });
    fireEvent.pointerMove(start, { pointerId: 3, clientX: 20 });
    fireEvent.pointerUp(start, { pointerId: 3, clientX: 20 });
    expect(main()[1]).toMatchObject({ mediaStart: 2, duration: 4, startAt: 4 });
  });

  it('is moved to another place on the main track with the mouse', () => {
    const a = clipButton('a');
    fireEvent.pointerDown(a, {
      pointerId: 4,
      clientX: 0,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(a, {
      pointerId: 4,
      clientX: 2,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(a, {
      pointerId: 4,
      clientX: 70,
      pointerType: 'mouse',
    });
    expect(document.querySelector('.bg-brand-primary.z-40')).not.toBeNull();
    fireEvent.pointerUp(a, { pointerId: 4, clientX: 70, pointerType: 'mouse' });
    expect(main().map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('is moved by a finger only after it rests on it; a swipe scrolls instead', () => {
    vi.useFakeTimers();
    const a = clipButton('a');
    fireEvent.pointerDown(a, {
      pointerId: 5,
      clientX: 0,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(a, {
      pointerId: 5,
      clientX: 30,
      pointerType: 'touch',
    });
    act(() => vi.advanceTimersByTime(HOLD_TO_MOVE_MS));
    fireEvent.pointerUp(a, { pointerId: 5, clientX: 30, pointerType: 'touch' });
    expect(main().map((c) => c.id)).toEqual(['a', 'b']);

    fireEvent.pointerDown(a, {
      pointerId: 6,
      clientX: 0,
      pointerType: 'touch',
    });
    act(() => vi.advanceTimersByTime(HOLD_TO_MOVE_MS));
    const scrolled = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(scrolled);
    expect(scrolled.defaultPrevented).toBe(true);
    fireEvent.pointerMove(a, {
      pointerId: 6,
      clientX: 70,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(a, { pointerId: 6, clientX: 70, pointerType: 'touch' });
    expect(main().map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('ends a gesture the browser takes away without choosing or moving anything', () => {
    vi.useFakeTimers();
    const a = clipButton('a');
    fireEvent.pointerDown(a, {
      pointerId: 11,
      clientX: 0,
      pointerType: 'touch',
    });
    fireEvent.pointerCancel(a, {
      pointerId: 11,
      clientX: 0,
      pointerType: 'touch',
    });
    act(() => vi.advanceTimersByTime(HOLD_TO_MOVE_MS));
    expect(store().selectedClipId).toBeNull();

    fireEvent.pointerDown(a, {
      pointerId: 12,
      clientX: 0,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(a, {
      pointerId: 12,
      clientX: 70,
      pointerType: 'mouse',
    });
    fireEvent.pointerCancel(a, {
      pointerId: 12,
      clientX: 70,
      pointerType: 'mouse',
    });
    expect(main().map((c) => c.id)).toEqual(['a', 'b']);
    expect(document.querySelector('.bg-brand-primary.z-40')).toBeNull();
    fireEvent.pointerCancel(a, { pointerId: 99 });
  });

  it('is not chosen when it is gone before the wait of a resting finger is up', () => {
    vi.useFakeTimers();
    fireEvent.pointerDown(clipButton('b'), {
      pointerId: 13,
      clientX: 0,
      pointerType: 'touch',
    });
    act(() => store().removeClip('b'));
    act(() => vi.advanceTimersByTime(HOLD_TO_MOVE_MS));
    expect(store().selectedClipId).toBeNull();
  });

  it('on a layer is moved in time', () => {
    const w = clipButton('w');
    fireEvent.pointerDown(w, {
      pointerId: 7,
      clientX: 0,
      pointerType: 'mouse',
    });
    fireEvent.pointerMove(w, {
      pointerId: 7,
      clientX: 30,
      pointerType: 'mouse',
    });
    fireEvent.pointerUp(w, { pointerId: 7, clientX: 30, pointerType: 'mouse' });
    expect(store().project?.tracks[1].clips[0].startAt).toBe(4);
  });

  it('ignores a pointer it did not start with, and the right button', () => {
    const a = clipButton('a');
    fireEvent.pointerMove(a, { pointerId: 9, clientX: 50 });
    fireEvent.pointerUp(a, { pointerId: 9, clientX: 50 });
    fireEvent.pointerDown(a, { pointerId: 8, clientX: 0, button: 2 });
    expect(store().selectedClipId).toBeNull();
  });
});

describe('the transport', () => {
  beforeEach(() => openTwoClips());

  it('writes time in minutes, seconds and tenths', () => {
    expect(formatTimecode(64.26)).toBe('1:04.3');
    expect(formatTimecode(-1)).toBe('0:00.0');
  });

  it('plays and pauses, starting again from the beginning at the end', () => {
    renderWithProviders(<EditorTransport />);
    act(() => store().setPlayhead(10));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(store()).toMatchObject({ playhead: 0, isPlaying: true });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(store().isPlaying).toBe(false);
  });

  it('undoes and redoes', () => {
    renderWithProviders(<EditorTransport />);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    act(() => store().setClipSpeed('a', 2));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(main()[0].speed).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(main()[0].speed).toBe(2);
  });
});

describe('the top bar', () => {
  beforeEach(() => openTwoClips());

  it.each([
    ['saving', 'Saving…'],
    ['saved', 'Saved'],
    ['error', 'Not saved'],
  ] as const)('says when the project is %s', (status, words) => {
    useStudioStore.setState({ saveStatus: status });
    renderWithProviders(
      <EditorTopbar onClose={vi.fn()} onExport={vi.fn()} busy={false} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(words);
  });

  it('goes back, opens the settings and exports', () => {
    const onClose = vi.fn();
    const onExport = vi.fn();
    renderWithProviders(
      <EditorTopbar onClose={onClose} onExport={onExport} busy={false} />,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: /Project settings/ }));
    expect(store().openSheet).toBe('settings');
    fireEvent.click(screen.getByRole('button', { name: /Project settings/ }));
    expect(store().openSheet).toBeNull();
    expect(onClose).toHaveBeenCalled();
    expect(onExport).toHaveBeenCalled();
  });
});

describe('the panels', () => {
  beforeEach(() => openTwoClips());

  it('beside the video, says what to do when none is open', () => {
    renderWithProviders(
      <EditorPanel variant="side" onAddAudioFile={vi.fn()} />,
    );
    expect(screen.getByText(/Choose a tool/)).toBeInTheDocument();
  });

  it('over the timeline, shows nothing when none is open, and closes', () => {
    const { container } = renderWithProviders(
      <EditorPanel variant="sheet" onAddAudioFile={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    act(() => store().setOpenSheet('adjust'));
    expect(screen.getByText('properties')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(store().openSheet).toBeNull();
  });

  it.each([
    'text',
    'audio',
    'filters',
    'subtitles',
    'speed',
    'volume',
    'settings',
    'media',
  ] as const)('shows the %s panel', (panel) => {
    act(() => store().setOpenSheet(panel));
    renderWithProviders(
      <EditorPanel variant="side" onAddAudioFile={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('sets the speed, showing how long the clip lasts', () => {
    useStudioStore.setState({ selectedClipId: 'b' });
    renderWithProviders(<ClipSpeedPanel />);
    fireEvent.click(screen.getByRole('button', { name: '3×' }));
    expect(main()[1]).toMatchObject({ speed: 3, duration: 2 });
    expect(screen.getByRole('button', { name: '3×' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/2.0 s/)).toBeInTheDocument();
  });

  it('sets the volume, and silences and brings back the sound', () => {
    useStudioStore.setState({ selectedClipId: 'a' });
    renderWithProviders(<ClipVolumePanel />);
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '150' } });
    expect(main()[0]).toMatchObject({ volume: 1.5, muted: false });
    fireEvent.change(slider, { target: { value: '0' } });
    expect(main()[0].muted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute clip' }));
    expect(main()[0].muted).toBe(false);
  });

  it('brings the sound of a clip silenced at zero back at its own level', () => {
    useStudioStore.setState({ selectedClipId: 'a' });
    act(() =>
      store().updateClip('a', { volume: 0, muted: true } as Partial<MediaClip>),
    );
    renderWithProviders(<ClipVolumePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute clip' }));
    expect(main()[0]).toMatchObject({ volume: 1, muted: false });
  });

  it('keeps one step of undo for one drag of the volume, and none for a touch', () => {
    useStudioStore.setState({ selectedClipId: 'a', past: [] });
    renderWithProviders(<ClipVolumePanel />);
    const slider = screen.getByRole('slider', { name: 'Volume' });
    fireEvent.pointerDown(slider);
    fireEvent.pointerUp(slider);
    expect(store().past).toHaveLength(0);
    fireEvent.change(slider, { target: { value: '120' } });
    fireEvent.change(slider, { target: { value: '140' } });
    fireEvent.pointerUp(slider);
    expect(store().past).toHaveLength(1);
    fireEvent.change(slider, { target: { value: '60' } });
    fireEvent.keyUp(slider);
    fireEvent.change(slider, { target: { value: '50' } });
    fireEvent.blur(slider);
    expect(store().past).toHaveLength(3);
  });

  it('shows no speed or volume for a text, or with nothing chosen', () => {
    useStudioStore.setState({ selectedClipId: 'w' });
    const speed = renderWithProviders(<ClipSpeedPanel />);
    expect(speed.container).toBeEmptyDOMElement();
    useStudioStore.setState({ selectedClipId: null });
    const volume = renderWithProviders(<ClipVolumePanel />);
    expect(volume.container).toBeEmptyDOMElement();
  });

  it('renames the project and changes its format', () => {
    renderWithProviders(<ProjectSettingsPanel />);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Trip' },
    });
    fireEvent.click(screen.getByRole('button', { name: /16:9/ }));
    expect(store().project).toMatchObject({
      name: 'Trip',
      aspectRatio: '16:9',
    });
    expect(screen.getByRole('button', { name: /16:9/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows no settings without a project', () => {
    useStudioStore.setState({ project: null });
    const { container } = renderWithProviders(<ProjectSettingsPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});
