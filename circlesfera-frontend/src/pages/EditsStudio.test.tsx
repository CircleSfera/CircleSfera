import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadApi } from '../services/upload.service';
import { useStudioStore } from '../stores/studioStore';
import { useUIStore } from '../stores/uiStore';
import { renderWithProviders } from '../test/test-utils';
import type { MediaClip, StudioProject, TextClip } from '../types/studio';
import { exportStudioProject } from '../utils/ffmpegExport';
import { StudioExportError } from '../utils/studioExportHelpers';
import { loadLocalStudioDraft } from '../utils/studioLocalDraft';
import EditsStudio, { MEDIA_PROBE_TIMEOUT_MS } from './EditsStudio';

type Props = Record<string, any>;

const seen = vi.hoisted(() => ({
  exportModal: {} as Record<string, any>,
  saveNow: undefined as unknown as ReturnType<
    typeof import('vitest')['vi']['fn']
  >,
  navigate: undefined as unknown as ReturnType<
    typeof import('vitest')['vi']['fn']
  >,
}));

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => seen.navigate,
}));
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { toast, default: toast };
});
vi.mock('../hooks/useStudioAutosave', () => ({
  useStudioAutosave: () => ({ saveNow: seen.saveNow }),
}));
vi.mock('../services/upload.service', () => ({
  uploadApi: { upload: vi.fn() },
}));
vi.mock('../utils/ffmpegExport', () => ({ exportStudioProject: vi.fn() }));
vi.mock('../utils/studioLocalDraft', () => ({ loadLocalStudioDraft: vi.fn() }));
vi.mock('../components/common/SEO', () => ({ default: () => null }));
vi.mock('../components/studio/StudioPlayer', () => ({ default: () => null }));
vi.mock('../components/studio/modals/ExportModal', () => ({
  default: (props: Props) => {
    seen.exportModal = props;
    return props.isOpen ? <div data-testid="export" /> : null;
  },
}));

const clip = (id: string, over: Partial<MediaClip> = {}): MediaClip => ({
  id,
  type: 'video',
  trackId: 'video',
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

const words = (id: string, over: Partial<TextClip> = {}): TextClip => ({
  id,
  type: 'text',
  trackId: 'text',
  startAt: 0,
  duration: 3,
  content: 'Hello',
  style: {
    fontFamily: 'Roboto',
    fontSize: 40,
    color: '#fff',
    backgroundColor: 'transparent',
    textAlign: 'center',
  },
  transform: { scale: 1, rotation: 0, x: 0, y: 0 },
  ...over,
});

const project = (
  clips: MediaClip[] = [],
  extra: StudioProject['tracks'] = [],
): StudioProject => ({
  id: 'p1',
  name: 'Edit',
  duration: 20,
  fps: 10,
  aspectRatio: '9:16',
  resolution: { width: 1080, height: 1920 },
  tracks: [
    {
      id: 'video',
      type: 'video',
      name: 'Video',
      clips,
      muted: false,
      hidden: false,
      locked: false,
    },
    ...extra,
  ],
  createdAt: '',
  updatedAt: '',
});

const store = () => useStudioStore.getState();
const mainClips = () => (store().project?.tracks[0].clips ?? []) as MediaClip[];

async function open(initial: StudioProject | null = project()) {
  useStudioStore.setState({
    project: initial,
    cloudProjectId: null,
    selectedClipId: null,
    playhead: 0,
    isPlaying: false,
    zoom: 50,
    openSheet: null,
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
  });
  const view = renderWithProviders(<EditsStudio />);
  await screen.findByRole('button', { name: 'Back to projects' });
  return view;
}

const press = (key: string, more: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', {
    key,
    code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
    ...more,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
};

const pick = (testId: string, files: File[]) =>
  fireEvent.change(screen.getByTestId(testId), { target: { files } });

describe('EditsStudio', () => {
  let mediaLength: number | 'unreadable';

  beforeEach(() => {
    vi.clearAllMocks();
    seen.saveNow = vi.fn().mockResolvedValue(undefined);
    seen.navigate = vi.fn();
    mediaLength = 12;
    vi.mocked(loadLocalStudioDraft).mockResolvedValue(null as never);
    vi.mocked(uploadApi.upload).mockResolvedValue({
      data: { url: 'https://cdn/uploaded.mp4' },
    } as never);
    URL.createObjectURL = vi.fn(() => 'blob:local');
    URL.revokeObjectURL = vi.fn();
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'video' && tag !== 'audio') return create(tag);
      const probe: Props = {
        get duration() {
          return mediaLength;
        },
        set src(_value: string) {
          queueMicrotask(() =>
            mediaLength === 'unreadable'
              ? probe.onerror?.()
              : probe.onloadedmetadata?.(),
          );
        },
        removeAttribute: () => {},
        load: () => {},
      };
      return probe;
    }) as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useStudioStore.setState({ project: null });
  });

  describe('opening', () => {
    it('starts a new, upright project with only its main track when there is no draft', async () => {
      await open(null);
      expect(store().project).toMatchObject({
        name: 'New Project',
        aspectRatio: '9:16',
        duration: 0,
      });
      expect(store().project?.tracks.map((tr) => tr.type)).toEqual(['video']);
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    });

    it('goes on with the draft kept on this device, and its cloud copy', async () => {
      vi.mocked(loadLocalStudioDraft).mockResolvedValue({
        project: project([clip('kept')]),
        cloudProjectId: 'cloud-1',
      } as never);
      await open(null);
      expect(mainClips().map((c) => c.id)).toEqual(['kept']);
      expect(store().cloudProjectId).toBe('cloud-1');
    });

    it('keeps the project already open, without reading the draft', async () => {
      await open(project([clip('open')]));
      expect(loadLocalStudioDraft).not.toHaveBeenCalled();
      expect(mainClips()[0].id).toBe('open');
    });

    it('saves a first cloud copy once the project has media on the server', async () => {
      await open(project([clip('up', { fileUrl: 'https://cdn/a.mp4' })]));
      expect(seen.saveNow).toHaveBeenCalled();
    });

    it('does not save one for media that is only on this device', async () => {
      await open(project([clip('local')]));
      expect(seen.saveNow).not.toHaveBeenCalled();
    });
  });

  describe('adding media', () => {
    it('puts videos and photos at the end of the main track, in order, then uploads them', async () => {
      await open(project([clip('first', { duration: 4 })]));
      pick('studio-media-input', [
        new File(['v'], 'a.mp4', { type: 'video/mp4' }),
        new File(['p'], 'b.jpg', { type: 'image/jpeg' }),
      ]);
      await waitFor(() => expect(mainClips()).toHaveLength(3));
      const [, video, photo] = mainClips();
      expect(video).toMatchObject({
        type: 'video',
        startAt: 4,
        duration: 12,
        sourceDuration: 12,
        muted: false,
      });
      expect(photo).toMatchObject({
        type: 'image',
        startAt: 16,
        duration: 3,
        muted: true,
      });
      await waitFor(() =>
        expect(mainClips()[2].fileUrl).toBe('https://cdn/uploaded.mp4'),
      );
      expect(uploadApi.upload).toHaveBeenCalledTimes(2);
    });

    it('opens the file picker from the timeline and from the tools', async () => {
      await open();
      const input = screen.getByTestId(
        'studio-media-input',
      ) as HTMLInputElement;
      const clicked = vi.spyOn(input, 'click');
      fireEvent.click(screen.getByRole('button', { name: 'Add clips' }));
      fireEvent.click(screen.getByRole('button', { name: 'Media' }));
      expect(clicked).toHaveBeenCalledTimes(2);
    });

    it('waits for the length of a recording that does not say it at first', async () => {
      await open();
      const create = (tag: string) =>
        Document.prototype.createElement.call(document, tag);
      vi.mocked(document.createElement).mockImplementation(((tag: string) => {
        if (tag !== 'video' && tag !== 'audio') return create(tag);
        let length = Number.POSITIVE_INFINITY;
        const probe: Props = {
          get duration() {
            return length;
          },
          set currentTime(_v: number) {
            length = 7;
            queueMicrotask(() => probe.ondurationchange?.());
          },
          set src(_v: string) {
            queueMicrotask(() => probe.onloadedmetadata?.());
          },
        };
        return probe;
      }) as never);
      pick('studio-media-input', [
        new File(['v'], 'r.webm', { type: 'video/webm' }),
      ]);
      await waitFor(() => expect(mainClips()[0]?.duration).toBe(7));
    });

    it('gives up on a file whose length never comes', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await open();
        const create = (tag: string) =>
          Document.prototype.createElement.call(document, tag);
        vi.mocked(document.createElement).mockImplementation(((tag: string) =>
          tag === 'video' || tag === 'audio'
            ? { set src(_v: string) {} }
            : create(tag)) as never);
        pick('studio-media-input', [
          new File(['v'], 'x.mp4', { type: 'video/mp4' }),
        ]);
        await act(async () => {
          vi.advanceTimersByTime(MEDIA_PROBE_TIMEOUT_MS);
        });
        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(mainClips()).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('says so when a video cannot be read', async () => {
      mediaLength = 'unreadable';
      await open();
      pick('studio-media-input', [
        new File(['v'], 'a.mp4', { type: 'video/mp4' }),
      ]);
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not upload media'),
      );
      expect(mainClips()).toHaveLength(0);
    });

    it('holds the export back while a file is uploading', async () => {
      let finish: (v: unknown) => void = () => {};
      vi.mocked(uploadApi.upload).mockReturnValue(
        new Promise((r) => (finish = r)) as never,
      );
      await open(project([clip('a')]));
      pick('studio-media-input', [
        new File(['p'], 'b.jpg', { type: 'image/jpeg' }),
      ]);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled(),
      );
      await act(async () => finish({ data: { url: 'https://cdn/x.jpg' } }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled(),
      );
    });

    it('puts a sound at the playhead on a sound layer of its own', async () => {
      await open(project([clip('a')]));
      act(() => store().setPlayhead(2));
      fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
      const input = document.querySelector(
        'input[accept="audio/*"]',
      ) as HTMLInputElement;
      fireEvent.change(input, {
        target: { files: [new File(['s'], 's.mp3', { type: 'audio/mpeg' })] },
      });
      await waitFor(() => expect(store().project?.tracks).toHaveLength(2));
      const layer = store().project?.tracks[1];
      expect(layer).toMatchObject({ type: 'audio', name: 'Audio' });
      expect(layer?.clips[0]).toMatchObject({
        type: 'audio',
        startAt: 2,
        duration: 12,
      });
      expect(toast.success).toHaveBeenCalledWith('Audio track added');
    });
  });

  describe('a chosen clip', () => {
    it('turns the tools to the clip, and Done lets go of it', async () => {
      await open(project([clip('a')]));
      act(() => store().selectClip('a'));
      expect(
        screen.getByRole('navigation', { name: 'Clip tools' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Speed' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(store().selectedClipId).toBeNull();
      expect(
        screen.getByRole('navigation', { name: 'Studio tools' }),
      ).toBeInTheDocument();
    });

    it('opens the speed panel and plays the clip faster, shorter', async () => {
      await open(project([clip('a', { duration: 10 })]));
      act(() => store().selectClip('a'));
      fireEvent.click(screen.getByRole('button', { name: 'Speed' }));
      fireEvent.click(screen.getAllByRole('button', { name: '2×' })[0]);
      expect(mainClips()[0]).toMatchObject({ speed: 2, duration: 5 });
    });

    it('duplicates the clip right after it, and chooses the copy', async () => {
      await open(
        project([
          clip('a', { duration: 4 }),
          clip('b', { startAt: 4, duration: 2 }),
        ]),
      );
      act(() => store().selectClip('a'));
      fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
      expect(mainClips().map((c) => c.startAt)).toEqual([0, 4, 8]);
      expect(mainClips()[1].id).toBe(store().selectedClipId);
    });

    it('replaces its media, keeping its place', async () => {
      mediaLength = 30;
      await open(project([clip('a', { duration: 6 })]));
      act(() => store().selectClip('a'));
      const input = screen.getByTestId(
        'studio-replace-input',
      ) as HTMLInputElement;
      const clicked = vi.spyOn(input, 'click');
      fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
      expect(clicked).toHaveBeenCalled();
      pick('studio-replace-input', [
        new File(['v'], 'n.mp4', { type: 'video/mp4' }),
      ]);
      await waitFor(() =>
        expect(mainClips()[0].fileUrl).toBe('https://cdn/uploaded.mp4'),
      );
      expect(mainClips()[0]).toMatchObject({
        id: 'a',
        duration: 6,
        sourceDuration: 30,
        mediaStart: 0,
      });
    });

    it('replaces a photo with a photo, lasting as long as before', async () => {
      await open(project([clip('a', { type: 'image', duration: 5 })]));
      act(() => store().selectClip('a'));
      pick('studio-replace-input', [
        new File(['p'], 'n.jpg', { type: 'image/jpeg' }),
      ]);
      await waitFor(() =>
        expect(mainClips()[0].fileUrl).toBe('https://cdn/uploaded.mp4'),
      );
      expect(mainClips()[0]).toMatchObject({ type: 'image', duration: 5 });
    });

    it('will not replace a picture with a sound', async () => {
      await open(project([clip('a')]));
      act(() => store().selectClip('a'));
      pick('studio-replace-input', [
        new File(['s'], 's.mp3', { type: 'audio/mpeg' }),
      ]);
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/sound can only be replaced/),
      );
      expect(mainClips()[0].fileUrl).toBe('blob:a');
    });

    it('cuts at the playhead, and only inside the clip', async () => {
      await open(project([clip('a', { duration: 10 })]));
      act(() => store().selectClip('a'));
      expect(screen.getByRole('button', { name: 'Split' })).toBeDisabled();
      act(() => store().setPlayhead(4));
      fireEvent.click(screen.getByRole('button', { name: 'Split' }));
      expect(mainClips().map((c) => c.duration)).toEqual([4, 6]);
    });

    it('deletes it, and the clips after it close the gap', async () => {
      await open(
        project([
          clip('a', { duration: 4 }),
          clip('b', { startAt: 4, duration: 3 }),
        ]),
      );
      act(() => store().selectClip('a'));
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(mainClips()).toEqual([
        expect.objectContaining({ id: 'b', startAt: 0 }),
      ]);
    });

    it('offers a text its own tools', async () => {
      await open(
        project(
          [clip('a')],
          [
            {
              id: 'text',
              type: 'text',
              name: 'Text',
              clips: [words('w')],
              muted: false,
              hidden: false,
              locked: false,
            },
          ],
        ),
      );
      act(() => store().selectClip('w'));
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Speed' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Replace' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('keys', () => {
    it('play and pause with space and with K', async () => {
      await open(project([clip('a')]));
      press(' ');
      expect(store().isPlaying).toBe(true);
      press('k');
      expect(store().isPlaying).toBe(false);
    });

    it('move one frame with the arrows and one second with J and L, within the project', async () => {
      await open(project([clip('a')]));
      press('ArrowRight');
      expect(store().playhead).toBeCloseTo(0.1);
      press('l');
      expect(store().playhead).toBeCloseTo(1.1);
      press('j');
      press('j');
      expect(store().playhead).toBe(0);
      press('ArrowLeft');
      expect(store().playhead).toBe(0);
    });

    it('zoom the timeline', async () => {
      await open(project([clip('a')]));
      press('+');
      expect(store().zoom).toBe(60);
      press('-');
      press('-');
      expect(store().zoom).toBe(40);
    });

    it('split and delete the chosen clip, and let go of it with Escape', async () => {
      await open(project([clip('a', { duration: 10 })]));
      act(() => {
        store().selectClip('a');
        store().setPlayhead(5);
      });
      press('s');
      expect(mainClips()).toHaveLength(2);
      press('Delete', { code: 'Delete' });
      expect(mainClips()).toHaveLength(1);
      act(() => store().selectClip(mainClips()[0].id));
      act(() => store().setOpenSheet('speed'));
      press('Escape', { code: 'Escape' });
      expect(store().openSheet).toBeNull();
      press('Escape', { code: 'Escape' });
      expect(store().selectedClipId).toBeNull();
    });

    it('undo and redo with Control or Command', async () => {
      await open(project([clip('a', { duration: 10 })]));
      act(() => store().setClipSpeed('a', 2));
      press('z', { metaKey: true });
      expect(mainClips()[0].speed).toBe(1);
      press('z', { ctrlKey: true, shiftKey: true });
      expect(mainClips()[0].speed).toBe(2);
    });

    it('are left to the export while it is open, and Space presses a button', async () => {
      await open(project([clip('a', { duration: 10 })]));
      act(() => {
        store().selectClip('a');
        store().setPlayhead(5);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      press('s');
      press('Delete', { code: 'Delete' });
      expect(mainClips()).toHaveLength(1);
      act(() => seen.exportModal.onClose());

      const play = screen.getByRole('button', { name: 'Play' });
      fireEvent.keyDown(play, { key: ' ', code: 'Space' });
      expect(store().isPlaying).toBe(false);
    });

    it('leave other keys with a modifier to the browser, and are left alone while typing', async () => {
      await open(project([clip('a')]));
      expect(press('-', { metaKey: true }).defaultPrevented).toBe(false);
      expect(press('k', { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(store().isPlaying).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: /Project settings/ }));
      const [name] = screen.getAllByLabelText('Name');
      fireEvent.keyDown(name, { key: ' ', code: 'Space' });
      expect(store().isPlaying).toBe(false);
    });
  });

  describe('export', () => {
    it('encodes the project with the chosen quality and shows its progress', async () => {
      const blob = new Blob(['mp4']);
      vi.mocked(exportStudioProject).mockImplementation((async (
        _p: unknown,
        options: Props,
      ) => {
        options?.onProgress?.(50);
        return blob;
      }) as never);
      await open(project([clip('a')]));
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      expect(screen.getByTestId('export')).toBeInTheDocument();
      await act(async () => seen.exportModal.onStartExport('balanced'));
      expect(exportStudioProject).toHaveBeenCalledWith(
        store().project,
        expect.objectContaining({ preset: 'balanced' }),
      );
      expect(seen.exportModal.exportedBlob).toBe(blob);
      expect(seen.exportModal.exportProgress).toBe(50);
    });

    it('closes when the encoding is cancelled', async () => {
      vi.mocked(exportStudioProject).mockImplementation((async (
        _p: unknown,
        options: Props,
      ) => {
        await new Promise((_, reject) =>
          options?.signal?.addEventListener('abort', () =>
            reject(new StudioExportError('studio.export_errors.cancelled')),
          ),
        );
        return new Blob();
      }) as never);
      await open(project([clip('a')]));
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = seen.exportModal.onStartExport('balanced');
      });
      await act(async () => {
        seen.exportModal.onCancelExport();
        await done;
      });
      expect(screen.queryByTestId('export')).not.toBeInTheDocument();
    });

    it('stops the encoding when the editor is left', async () => {
      let signal: AbortSignal | undefined;
      vi.mocked(exportStudioProject).mockImplementation((async (
        _p: unknown,
        options: Props,
      ) => {
        signal = options?.signal;
        return new Promise(() => {});
      }) as never);
      const view = await open(project([clip('a')]));
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      act(() => {
        void seen.exportModal.onStartExport('balanced');
      });
      view.unmount();
      expect(signal?.aborted).toBe(true);
    });

    it.each([
      [
        new StudioExportError('studio.export_errors.encode_failed'),
        'Video encoding failed. Try fewer clips or shorter media',
      ],
      [new Error('boom'), 'Error exporting the video. Please try again.'],
    ])('says why when it fails, and stays open', async (error, message) => {
      vi.mocked(exportStudioProject).mockRejectedValue(error);
      await open(project([clip('a')]));
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      await act(async () => seen.exportModal.onStartExport('balanced'));
      expect(toast.error).toHaveBeenCalledWith(message);
      expect(screen.getByTestId('export')).toBeInTheDocument();
    });

    it('cannot be closed while it is encoding', async () => {
      vi.mocked(exportStudioProject).mockReturnValue(new Promise(() => {}));
      await open(project([clip('a')]));
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      act(() => {
        void seen.exportModal.onStartExport('balanced');
      });
      act(() => seen.exportModal.onClose());
      expect(screen.getByTestId('export')).toBeInTheDocument();
    });

    it('hands the video to the composer as a frame, with its date when scheduled', async () => {
      vi.mocked(exportStudioProject).mockResolvedValue(
        new File(['mp4'], 'e.mp4'),
      );
      await open(project([clip('a')]));
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      await act(async () => seen.exportModal.onStartExport('balanced'));
      await act(async () => seen.exportModal.onPublish('2026-12-01T10:00'));
      expect(useUIStore.getState().editedMediaForPost).toMatchObject({
        scheduledAt: '2026-12-01T10:00',
      });
      expect(seen.navigate).toHaveBeenCalledWith('/create?mode=frame');
    });

    it('downloads the video under the project name, and closes', async () => {
      vi.mocked(exportStudioProject).mockResolvedValue(
        new File(['mp4'], 'e.mp4'),
      );
      await open(project([clip('a')]));
      fireEvent.click(screen.getByRole('button', { name: 'Export' }));
      await act(async () => seen.exportModal.onStartExport('balanced'));
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      act(() => seen.exportModal.onDownload());
      expect(clickSpy).toHaveBeenCalled();
      expect(screen.queryByTestId('export')).not.toBeInTheDocument();
    });
  });

  it('saves and goes back to the projects', async () => {
    await open(project([clip('a')]));
    act(() => store().setPlaying(true));
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    await waitFor(() => expect(seen.navigate).toHaveBeenCalledWith('/edits'));
    expect(seen.saveNow).toHaveBeenCalled();
    expect(store().isPlaying).toBe(false);
  });
});
