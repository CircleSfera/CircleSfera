import { act, fireEvent, screen } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../stores/studioStore';
import { renderWithProviders } from '../../test/test-utils';
import type {
  Clip,
  MediaClip,
  StudioProject,
  TextClip,
  Track,
} from '../../types/studio';
import TrackItem from './Track';

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const media = (id: string, over: Partial<MediaClip> = {}): MediaClip => ({
  id,
  type: 'video',
  trackId: 'v1',
  startAt: 2,
  duration: 6,
  fileUrl: `https://cdn.example.com/${id}.mp4`,
  file: null,
  mediaStart: 3,
  speed: 1,
  volume: 1,
  muted: false,
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

const words: TextClip = {
  id: 'text-1',
  type: 'text',
  trackId: 't1',
  startAt: 2,
  duration: 6,
  content: 'Hello',
  style: {
    fontFamily: 'Inter',
    fontSize: 40,
    color: '#fff',
    backgroundColor: 'transparent',
    textAlign: 'center',
  },
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
};

const track = (
  id: string,
  type: Track['type'],
  clips: Clip[],
  over: Partial<Track> = {},
): Track => ({
  id,
  type,
  name: id,
  clips,
  muted: false,
  hidden: false,
  locked: false,
  ...over,
});

const project = (tracks: Track[]): StudioProject => ({
  id: 'p1',
  name: 'Edit',
  tracks,
  duration: 20,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  createdAt: '',
  updatedAt: '',
});

const store = () => useStudioStore.getState();
const stored = (id: string) =>
  store()
    .project?.tracks.flatMap((tr) => tr.clips)
    .find((c) => c.id === id) as MediaClip;

/** Shows the first track of a project, with the zoom at ten pixels a second. */
function show(tracks: Track[], selectedClipId: string | null = null) {
  useStudioStore.setState({
    project: project(tracks),
    selectedClipId,
    zoom: 10,
    playhead: 0,
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
  });
  function Live() {
    const current = useStudioStore((s) => s.project?.tracks[0]);
    return current ? <TrackItem track={current} /> : null;
  }
  return renderWithProviders(<Live />);
}

/** Presses on an element and moves the pointer by a number of pixels. */
function drag(element: Element, byPx: number) {
  (element as HTMLElement).setPointerCapture = vi.fn();
  fireEvent.pointerDown(element, { pointerId: 1, clientX: 100 });
  act(() => {
    window.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 100 + byPx }),
    );
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
}

describe('a track of the studio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('its controls', () => {
    it('hides, shows, locks and unlocks the track', () => {
      show([track('v1', 'video', [])]);

      fireEvent.click(screen.getByRole('button', { name: 'Hide track' }));
      expect(store().project?.tracks[0].hidden).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Show track' }));
      expect(store().project?.tracks[0].hidden).toBe(false);

      fireEvent.click(screen.getByRole('button', { name: 'Lock track' }));
      expect(store().project?.tracks[0].locked).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Unlock track' }));
      expect(store().project?.tracks[0].locked).toBe(false);
    });

    it('removes an empty track at once, and says so', () => {
      show([track('a1', 'audio', []), track('v1', 'video', [])]);

      fireEvent.click(screen.getByRole('button', { name: 'Remove track' }));

      expect(store().project?.tracks.map((tr) => tr.id)).toEqual(['v1']);
      expect(toast.success).toHaveBeenCalledWith('Track removed');
    });

    it('does not let the last video track be removed', () => {
      show([track('v1', 'video', []), track('a1', 'audio', [])]);

      expect(
        screen.getByRole('button', { name: 'Remove track' }),
      ).toBeDisabled();
    });

    it('lets a video track go when another one stays', () => {
      show([track('v1', 'video', []), track('v2', 'video', [])]);

      fireEvent.click(screen.getByRole('button', { name: 'Remove track' }));

      expect(store().project?.tracks.map((tr) => tr.id)).toEqual(['v2']);
    });
  });

  describe('its clips', () => {
    it('places each clip by its time and length, at the zoom of the timeline', () => {
      show([track('v1', 'video', [media('a')])]);

      const clip = screen.getByRole('button', { name: 'Video' });
      expect(clip).toHaveStyle({ left: '20px', width: '60px' });
    });

    it('names a clip by its kind, and a text by what it says', () => {
      show([
        track('v1', 'video', [
          media('p', { type: 'image' }),
          media('s', { type: 'audio' }),
          words,
        ]),
      ]);

      expect(screen.getByRole('button', { name: 'Image' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Audio' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument();
    });

    it('selects a clip when it is pressed, and can undo what follows', () => {
      show([track('v1', 'video', [media('a')])]);

      drag(screen.getByRole('button', { name: 'Video' }), 0);

      expect(store().selectedClipId).toBe('a');
      expect(store().canUndo).toBe(true);
    });

    it('moves a clip along the timeline, never before its start', () => {
      show([track('v1', 'video', [media('a')])]);

      drag(screen.getByRole('button', { name: 'Video' }), 30);
      expect(stored('a').startAt).toBe(5);

      drag(screen.getByRole('button', { name: 'Video' }), -500);
      expect(stored('a').startAt).toBe(0);
    });
  });

  describe('trimming the end', () => {
    it('makes the clip longer or shorter, and leaves its start', () => {
      show([track('v1', 'video', [media('a')])], 'a');

      drag(screen.getByRole('button', { name: 'Trim end' }), -20);

      expect(stored('a')).toMatchObject({
        startAt: 2,
        duration: 4,
        mediaStart: 3,
      });
    });

    it('never leaves less than half a second', () => {
      show([track('v1', 'video', [media('a')])], 'a');

      drag(screen.getByRole('button', { name: 'Trim end' }), -500);

      expect(stored('a').duration).toBe(0.5);
    });
  });

  describe('trimming the start', () => {
    it('takes from the start what the edge moved over', () => {
      show([track('v1', 'video', [media('a')])], 'a');

      drag(screen.getByRole('button', { name: 'Trim start' }), 20);

      // Two seconds less: it starts two seconds later, in time and in its file.
      expect(stored('a')).toMatchObject({
        startAt: 4,
        duration: 4,
        mediaStart: 5,
      });
    });

    it('counts the speed of the clip in what it takes from its file', () => {
      show([track('v1', 'video', [media('fast', { speed: 2 })])], 'fast');
      drag(screen.getByRole('button', { name: 'Trim start' }), 10);
      // One second of timeline at double speed is two seconds of the file.
      expect(stored('fast')).toMatchObject({
        startAt: 3,
        duration: 5,
        mediaStart: 5,
      });
    });

    it('counts a slowed clip the other way', () => {
      show([track('v1', 'video', [media('slow', { speed: 0.5 })])], 'slow');
      drag(screen.getByRole('button', { name: 'Trim start' }), 10);
      expect(stored('slow')).toMatchObject({
        startAt: 3,
        duration: 5,
        mediaStart: 3.5,
      });
    });

    it('brings back what was trimmed, but nothing from before the start of the file', () => {
      show(
        [track('v1', 'video', [media('a', { startAt: 10, mediaStart: 3 })])],
        'a',
      );

      // The file only has three seconds before where the clip starts.
      drag(screen.getByRole('button', { name: 'Trim start' }), -200);

      expect(stored('a')).toMatchObject({
        startAt: 7,
        duration: 9,
        mediaStart: 0,
      });
    });

    it('does not go before the start of the timeline, and keeps its end', () => {
      show([track('v1', 'video', [media('a')])], 'a');

      // Two seconds of timeline before it, three of file: the timeline stops it.
      drag(screen.getByRole('button', { name: 'Trim start' }), -200);

      expect(stored('a')).toMatchObject({
        startAt: 0,
        duration: 8,
        mediaStart: 1,
      });
    });

    it('counts the speed in how much of the file there is to bring back', () => {
      show(
        [
          track('v1', 'video', [
            media('fast', { startAt: 10, mediaStart: 3, speed: 2 }),
          ]),
        ],
        'fast',
      );

      // Three seconds of file at double speed are a second and a half of timeline.
      drag(screen.getByRole('button', { name: 'Trim start' }), -200);

      expect(stored('fast')).toMatchObject({
        startAt: 8.5,
        duration: 7.5,
        mediaStart: 0,
      });
    });

    it('never leaves less than half a second', () => {
      show([track('v1', 'video', [media('a')])], 'a');

      drag(screen.getByRole('button', { name: 'Trim start' }), 500);

      expect(stored('a').duration).toBe(0.5);
      expect(stored('a').startAt).toBe(7.5);
    });

    it('trims a text, which has no file behind it', () => {
      show([track('t1', 'text', [words])], 'text-1');

      drag(screen.getByRole('button', { name: 'Trim start' }), 20);

      const text = stored('text-1');
      expect(text).toMatchObject({ startAt: 4, duration: 4 });
      expect(text).not.toHaveProperty('mediaStart');
    });
  });

  it('cannot be worked on while it is locked', () => {
    show([track('v1', 'video', [media('a')], { locked: true })]);

    const clips = screen.getByRole('button', { name: 'Video' }).parentElement;
    expect(clips).toHaveClass('pointer-events-none');
  });
});
