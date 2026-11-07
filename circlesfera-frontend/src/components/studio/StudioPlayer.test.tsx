import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioStore } from '../../stores/studioStore';
import { renderWithProviders } from '../../test/test-utils';
import type {
  MediaClip,
  StudioProject,
  TextClip,
  Track,
} from '../../types/studio';
import {
  drawEffect,
  drawTransition,
  liftPicture,
  sharpenPicture,
  warmPicture,
} from '../../utils/studioCanvasFx';
import StudioPlayer from './StudioPlayer';

vi.mock('../../utils/studioCanvasFx', async (original) => ({
  ...(await original<typeof import('../../utils/studioCanvasFx')>()),
  drawEffect: vi.fn(),
  drawTransition: vi.fn(),
  liftPicture: vi.fn(),
  warmPicture: vi.fn(),
  sharpenPicture: vi.fn(),
}));

const media = (
  id: string,
  type: MediaClip['type'],
  over: Partial<MediaClip> = {},
): MediaClip => ({
  id,
  type,
  trackId: 't',
  startAt: 0,
  duration: 10,
  fileUrl: `blob:${id}`,
  file: null,
  mediaStart: 0,
  speed: 1,
  volume: 1,
  muted: false,
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

const text = (id: string, over: Partial<TextClip> = {}): TextClip => ({
  id,
  type: 'text',
  trackId: 't',
  startAt: 0,
  duration: 10,
  content: 'Hello',
  style: {
    fontFamily: 'Inter',
    fontSize: 50,
    color: '#fff000',
    backgroundColor: 'transparent',
    textAlign: 'center',
  },
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

const track = (
  type: Track['type'],
  clips: Track['clips'],
  over: Partial<Track> = {},
): Track => ({
  id: `${type}-track`,
  type,
  name: type,
  clips,
  muted: false,
  hidden: false,
  locked: false,
  ...over,
});

const project = (
  tracks: Track[],
  over: Partial<StudioProject> = {},
): StudioProject => ({
  id: 'p1',
  name: 'Edit',
  tracks,
  duration: 20,
  fps: 30,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  createdAt: '',
  updatedAt: '',
  ...over,
});

/** What the browser would know about each video and audio element. */
const playing = new WeakMap<HTMLMediaElement, boolean>();
/** What was drawn on the preview since the last frame. */
let drawn: string[];
let frame: () => void;
/** How each picture was drawn: its filter and how opaque. */
let paints: { filter: string; alpha: number }[];

const element = <T extends HTMLMediaElement>(tag: string, src: string) =>
  [...document.querySelectorAll<T>(tag)].find(
    (el) => el.getAttribute('src') === src,
  ) as T;
const video = (id: string) => element<HTMLVideoElement>('video', `blob:${id}`);
const audio = (id: string) => element<HTMLAudioElement>('audio', `blob:${id}`);

function open(
  initial: StudioProject | null,
  state: { playhead?: number; isPlaying?: boolean } = {},
) {
  useStudioStore.setState({
    project: initial,
    playhead: state.playhead ?? 0,
    isPlaying: state.isPlaying ?? false,
  });
  return renderWithProviders(<StudioPlayer />);
}
const change = (state: Partial<ReturnType<typeof useStudioStore.getState>>) =>
  act(() => useStudioStore.setState(state));

describe('StudioPlayer', () => {
  beforeEach(() => {
    drawn = [];
    paints = [];
    HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLMediaElement) {
      playing.set(this, true);
      return Promise.resolve();
    }) as never;
    HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLMediaElement) {
      playing.set(this, false);
    }) as never;
    HTMLMediaElement.prototype.load = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return !playing.get(this);
      },
    });
    const context: Record<string, unknown> = {
      filter: 'none',
      globalAlpha: 1,
      fillRect: vi.fn(),
      clearRect: () => drawn.push('clear'),
      save: vi.fn(),
      restore: () => {
        context.filter = 'none';
        context.globalAlpha = 1;
      },
      translate: (x: number, y: number) => drawn.push(`at ${x},${y}`),
      rotate: (r: number) => drawn.push(`rotate ${r.toFixed(2)}`),
      scale: (x: number, y: number) => drawn.push(`scale ${x},${y}`),
      drawImage: (
        source: HTMLElement,
        x: number,
        y: number,
        w: number,
        h: number,
      ) => {
        paints.push({
          filter: context.filter as string,
          alpha: context.globalAlpha as number,
        });
        drawn.push(
          `${source.tagName.toLowerCase()} ${source.getAttribute('src')} ${x},${y} ${w}x${h}`,
        );
      },
      measureText: (content: string) => ({ width: content.length * 10 }),
      beginPath: vi.fn(),
      roundRect: (x: number, y: number, w: number, h: number) =>
        drawn.push(`box ${x},${y} ${w}x${h}`),
      fill: vi.fn(),
      strokeText: (content: string) => drawn.push(`outline ${content}`),
      fillText: (content: string, x: number, y: number) =>
        drawn.push(`text ${content} ${x},${y}`),
    };
    HTMLCanvasElement.prototype.getContext = (() => context) as never;
    // One frame at a time, when the test asks for it.
    vi.stubGlobal('requestAnimationFrame', (next: () => void) => {
      frame = next;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    // Unmount first: the store change would otherwise re-render the screen
    // after the test, outside act.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useStudioStore.setState({ project: null, playhead: 0, isPlaying: false });
  });

  it('shows nothing without a project', () => {
    const { container } = open(null);

    expect(container).toBeEmptyDOMElement();
  });

  it('asks for media when the project is empty', () => {
    open(project([track('video', [])]));

    expect(screen.getByText('Add media to start editing')).toBeInTheDocument();
  });

  it.each([
    ['9:16', 1080, 1920],
    ['16:9', 1920, 1080],
    ['1:1', 1080, 1080],
    ['4:5', 1080, 1350],
  ] as const)(
    'draws a %s project at %i by %i',
    (aspectRatio, width, height) => {
      const { container } = open(project([], { aspectRatio }));

      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveAttribute('width', String(width));
      expect(canvas).toHaveAttribute('height', String(height));
    },
  );

  describe('video', () => {
    const clip = (over: Partial<MediaClip> = {}) => media('v1', 'video', over);

    it('shows the moment of the clip the playhead is on, counting its trim', () => {
      open(project([track('video', [clip({ startAt: 2, mediaStart: 5 })])]), {
        playhead: 6,
      });

      // Four seconds into the clip, which starts five seconds into its file.
      expect(video('v1').currentTime).toBe(9);
      expect(video('v1').paused).toBe(true);
    });

    it('counts the speed of the clip', () => {
      open(project([track('video', [clip({ speed: 2 })])]), { playhead: 3 });

      expect(video('v1').currentTime).toBe(6);
      expect(video('v1').playbackRate).toBe(2);
    });

    it('plays and pauses with the preview', () => {
      open(project([track('video', [clip()])]), { isPlaying: true });
      expect(video('v1').paused).toBe(false);

      change({ isPlaying: false });
      expect(video('v1').paused).toBe(true);
    });

    it('stops a clip the playhead has left', () => {
      open(project([track('video', [clip({ duration: 5 })])]), {
        isPlaying: true,
      });
      expect(video('v1').paused).toBe(false);

      change({ playhead: 5 });

      expect(video('v1').paused).toBe(true);
    });

    it('does not load a clip the playhead has not reached', () => {
      open(project([track('video', [clip({ startAt: 8 })])]), { playhead: 2 });

      expect(video('v1')).toBeUndefined();
    });

    it('is silent when the clip or its track is muted, and never louder than full', () => {
      open(
        project([
          track('video', [
            media('muted', 'video', { muted: true }),
            media('loud', 'video', { volume: 3 }),
          ]),
        ]),
      );
      expect(video('muted').muted).toBe(true);
      expect(video('loud').muted).toBe(false);
      expect(video('loud').volume).toBe(1);

      change({
        project: project([
          track('video', [media('loud', 'video')], { muted: true }),
        ]),
      });
      expect(video('loud').muted).toBe(true);
    });

    it('stops a clip whose track is hidden', () => {
      const tracks = (hidden: boolean) =>
        project([track('video', [clip()], { hidden })]);
      open(tracks(false), { isPlaying: true });
      expect(video('v1').paused).toBe(false);

      change({ project: tracks(true) });

      expect(video('v1').paused).toBe(true);
    });
  });

  describe('audio', () => {
    const song = (over: Partial<MediaClip> = {}) => media('a1', 'audio', over);
    const withSong = (trackOver: Partial<Track> = {}, clips = [song()]) =>
      project([track('audio', clips, trackOver)]);

    it('sounds from the right moment while the preview plays', () => {
      open(withSong({}, [song({ startAt: 2, mediaStart: 10 })]), {
        playhead: 5,
        isPlaying: true,
      });

      expect(audio('a1').currentTime).toBe(13);
      expect(audio('a1').paused).toBe(false);
    });

    it('is silent before and after its clip', () => {
      open(withSong({}, [song({ startAt: 2, duration: 3 })]), {
        playhead: 3,
        isPlaying: true,
      });
      expect(audio('a1').paused).toBe(false);

      change({ playhead: 6 });
      expect(audio('a1').paused).toBe(true);
    });

    it('pauses with the preview', () => {
      open(withSong(), { isPlaying: true });

      change({ isPlaying: false });

      expect(audio('a1').paused).toBe(true);
    });

    it('stops when its clip is muted', () => {
      open(withSong(), { isPlaying: true });

      change({ project: withSong({}, [song({ muted: true })]) });

      expect(audio('a1').paused).toBe(true);
    });

    it('stops when its track is muted while it sounds', () => {
      open(withSong(), { isPlaying: true });
      expect(audio('a1').paused).toBe(false);

      change({ project: withSong({ muted: true }) });

      expect(audio('a1').paused).toBe(true);
    });

    it('sounds again when its track is unmuted', () => {
      open(withSong({ muted: true }), { isPlaying: true, playhead: 4 });

      change({ project: withSong() });

      expect(audio('a1').paused).toBe(false);
      expect(audio('a1').currentTime).toBe(4);
    });

    it('stops when its clip is removed while it sounds', () => {
      open(withSong(), { isPlaying: true });
      const element = audio('a1');
      expect(element.paused).toBe(false);

      change({ project: withSong({}, []) });

      expect(element.paused).toBe(true);
    });
  });

  describe('what is drawn', () => {
    const sized = (el: HTMLVideoElement, width: number, height: number) => {
      Object.defineProperty(el, 'videoWidth', { value: width });
      Object.defineProperty(el, 'videoHeight', { value: height });
    };

    it('fits a video inside the frame, keeping its shape', () => {
      open(project([track('video', [media('v1', 'video')])]));
      sized(video('v1'), 1920, 1080);

      act(() => frame());

      // A wide video in a tall frame: full width, centred.
      expect(drawn).toContain('at 540,960');
      expect(drawn).toContain('video blob:v1 -540,-303.75 1080x607.5');
    });

    it('applies the move, the turn, the size and the mirror of a clip', () => {
      open(
        project([
          track('video', [
            media('v1', 'video', {
              flipX: true,
              transform: { scale: 2, rotation: 90, x: 30, y: -40 },
            }),
          ]),
        ]),
      );
      sized(video('v1'), 1080, 1920);

      act(() => frame());

      expect(drawn).toContain('at 570,920');
      expect(drawn).toContain('rotate 1.57');
      expect(drawn).toContain('scale -2,2');
    });

    it('draws nothing of a video that has not loaded its picture yet', () => {
      open(project([track('video', [media('v1', 'video')])]));

      act(() => frame());

      expect(drawn.filter((line) => line.startsWith('video'))).toEqual([]);
    });

    it('draws the tracks in their order, one over the other', () => {
      open(
        project([
          track('video', [media('below', 'video')], { id: 'one' }),
          track('video', [media('above', 'video')], { id: 'two' }),
        ]),
      );
      sized(video('below'), 1080, 1920);
      sized(video('above'), 1080, 1920);

      act(() => frame());

      expect(
        drawn
          .filter((line) => line.startsWith('video'))
          .map((l) => l.split(' ')[1]),
      ).toEqual(['blob:below', 'blob:above']);
    });

    it('writes a text in the middle, moved by its own offset', () => {
      open(
        project([
          track('text', [
            text('t1', { transform: { scale: 1, rotation: 0, x: 0, y: 200 } }),
          ]),
        ]),
      );

      act(() => frame());

      expect(drawn).toContain('text Hello 540,1160');
      expect(drawn.some((line) => line.startsWith('box'))).toBe(false);
    });

    it('puts a box behind a text that has a background, and outlines one that has a stroke', () => {
      open(
        project([
          track('text', [
            text('t1', {
              style: {
                fontFamily: 'Inter',
                fontSize: 50,
                color: '#fff',
                backgroundColor: '#000',
                textAlign: 'center',
                strokeColor: '#f00',
                strokeWidth: 2,
              },
            }),
          ]),
        ]),
      );

      act(() => frame());

      // The text is 50 wide here; the box adds 12 of padding on each side.
      expect(drawn).toContain('box 503,916 74x72');
      expect(drawn).toContain('outline Hello');
    });

    it('does not write a text outside its time or on a hidden track', () => {
      open(
        project([
          track('text', [text('late', { startAt: 5, content: 'Late' })]),
          track('text', [text('hidden', { content: 'Hidden' })], {
            id: 'hidden-track',
            hidden: true,
          }),
        ]),
        { playhead: 1 },
      );

      act(() => frame());

      expect(drawn.filter((line) => line.startsWith('text'))).toEqual([]);
    });
  });

  describe('the passing of time', () => {
    it('moves the playhead while the preview plays', () => {
      vi.useFakeTimers();
      open(project([track('video', [])]), { isPlaying: true });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(useStudioStore.getState().playhead).toBeCloseTo(1, 1);
    });

    it('stays put while it is paused', () => {
      vi.useFakeTimers();
      open(project([track('video', [])]), { playhead: 3 });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(useStudioStore.getState().playhead).toBe(3);
    });

    it('stops at the end and goes back to the start', () => {
      vi.useFakeTimers();
      open(project([track('video', [])], { duration: 4 }), {
        playhead: 3.5,
        isPlaying: true,
      });

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(useStudioStore.getState().playhead).toBe(0);
      expect(useStudioStore.getState().isPlaying).toBe(false);
    });
  });

  it('stops and removes every video and sound when the studio is left', () => {
    const { unmount } = open(
      project([
        track('video', [media('v1', 'video')]),
        track('audio', [media('a1', 'audio')]),
      ]),
      { isPlaying: true },
    );
    const [clipVideo, clipAudio] = [video('v1'), audio('a1')];

    unmount();

    expect(clipVideo.paused).toBe(true);
    expect(clipAudio.paused).toBe(true);
    expect(clipVideo.isConnected).toBe(false);
    expect(clipAudio.isConnected).toBe(false);
  });
  describe('transitions, adjustments and effects', () => {
    const sized = (el: HTMLVideoElement) => {
      Object.defineProperty(el, 'videoWidth', { value: 1080 });
      Object.defineProperty(el, 'videoHeight', { value: 1920 });
    };
    beforeEach(() => {
      for (const fn of [
        drawTransition,
        drawEffect,
        liftPicture,
        warmPicture,
        sharpenPicture,
      ]) {
        vi.mocked(fn).mockClear();
      }
    });

    const cut = (over: Partial<MediaClip> = {}) =>
      project([
        track('video', [
          media('a', 'video', {
            duration: 4,
            transitionOut: { kind: 'slideleft', duration: 1 },
            ...over,
          }),
          media('b', 'video', { startAt: 3, duration: 4 }),
        ]),
      ]);

    it('draws the two clips of a cut through its transition, at how far in it is', () => {
      open(cut(), { playhead: 3.25 });
      sized(video('a'));
      sized(video('b'));
      act(() => frame());
      expect(drawTransition).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(HTMLCanvasElement),
        expect.any(HTMLCanvasElement),
        'slideleft',
        0.25,
        1080,
        1920,
      );
      // Both clips play through the overlap.
      expect(video('a')).toBeDefined();
      expect(video('b')).toBeDefined();
    });

    it('draws a layer’s overlapping clips one over the other, with no transition', () => {
      open(
        project([
          track('video', [media('base', 'video', { duration: 10 })]),
          track(
            'video',
            [
              media('x', 'video', {
                duration: 4,
                transitionOut: { kind: 'crossfade', duration: 1 },
              }),
              media('y', 'video', { startAt: 3, duration: 4 }),
            ],
            { id: 'layer' },
          ),
        ]),
        { playhead: 3.5 },
      );
      act(() => frame());
      expect(drawTransition).not.toHaveBeenCalled();
    });

    it('draws part of a filter over the plain picture, with its adjustments', () => {
      open(
        project([
          track('video', [
            media('v1', 'video', {
              filter: 'sepia(1)',
              filterIntensity: 40,
              color: {
                brightness: 0,
                contrast: 50,
                saturation: 0,
                warmth: 0,
                exposure: 0,
                sharpness: 0,
              },
            }),
          ]),
        ]),
      );
      sized(video('v1'));
      act(() => frame());
      expect(paints).toEqual([
        { filter: 'contrast(1.5)', alpha: 1 },
        { filter: 'contrast(1.5) sepia(1)', alpha: 0.4 },
      ]);
    });

    it('draws all of a filter at once at full intensity', () => {
      open(
        project([
          track('video', [media('v1', 'video', { filter: 'sepia(1)' })]),
        ]),
      );
      sized(video('v1'));
      act(() => frame());
      expect(paints).toEqual([{ filter: 'sepia(1)', alpha: 1 }]);
    });

    it('lifts and warms a picture as it plays, and sharpens it only when still, once', () => {
      const color = {
        brightness: 40,
        contrast: 0,
        saturation: 0,
        warmth: 30,
        exposure: 0,
        sharpness: 50,
      };
      open(project([track('video', [media('v1', 'video', { color })])]), {
        isPlaying: true,
      });
      sized(video('v1'));
      Object.defineProperty(video('v1'), 'readyState', { value: 4 });
      act(() => frame());
      expect(liftPicture).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        0.2,
      );
      expect(warmPicture).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        0.105,
      );
      expect(sharpenPicture).not.toHaveBeenCalled();

      change({ isPlaying: false });
      act(() => frame());
      act(() => frame());
      expect(sharpenPicture).toHaveBeenCalledTimes(1);
    });

    it('sharpens a still video only once it has found its frame', () => {
      const color = {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        warmth: 0,
        exposure: 0,
        sharpness: 50,
      };
      open(project([track('video', [media('v1', 'video', { color })])]));
      sized(video('v1'));
      Object.defineProperty(video('v1'), 'readyState', { value: 4 });
      Object.defineProperty(video('v1'), 'seeking', {
        value: true,
        configurable: true,
      });
      act(() => frame());
      expect(sharpenPicture).not.toHaveBeenCalled();
      Object.defineProperty(video('v1'), 'seeking', { value: false });
      act(() => frame());
      expect(sharpenPicture).toHaveBeenCalledTimes(1);
    });

    it('sharpens a still photo only once it has loaded', () => {
      const photos: Record<string, unknown>[] = [];
      vi.stubGlobal(
        'Image',
        class {
          complete = false;
          naturalWidth = 0;
          naturalHeight = 0;
          src = '';
          crossOrigin = '';
          tagName = 'IMG';
          constructor() {
            photos.push(this as unknown as Record<string, unknown>);
          }
          getAttribute() {
            return this.src;
          }
        },
      );
      const color = {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        warmth: 0,
        exposure: 0,
        sharpness: 50,
      };
      open(project([track('video', [media('p1', 'image', { color })])]));
      act(() => frame());
      expect(sharpenPicture).not.toHaveBeenCalled();
      Object.assign(photos[0], {
        complete: true,
        naturalWidth: 1080,
        naturalHeight: 1920,
      });
      act(() => frame());
      expect(sharpenPicture).toHaveBeenCalledTimes(1);
    });

    it('lays the effects under way over the picture, at their own time', () => {
      open(
        project([
          track('video', [media('v1', 'video')]),
          track(
            'effect',
            [
              {
                id: 'fx',
                type: 'effect',
                trackId: 'e',
                startAt: 2,
                duration: 3,
                effect: 'shake',
                intensity: 50,
              },
              {
                id: 'later',
                type: 'effect',
                trackId: 'e',
                startAt: 8,
                duration: 3,
                effect: 'blur',
                intensity: 50,
              },
            ] as never,
            { id: 'e' },
          ),
        ]),
        { playhead: 3 },
      );
      act(() => frame());
      // Only the effect the playhead is in, on every frame drawn.
      const drawnFx = vi.mocked(drawEffect).mock.calls.map(([, , fx]) => fx.id);
      expect(new Set(drawnFx)).toEqual(new Set(['fx']));
      expect(drawEffect).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        expect.any(HTMLCanvasElement),
        expect.objectContaining({ id: 'fx' }),
        1,
      );
    });
  });
});
