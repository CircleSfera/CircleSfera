import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadApi } from '../services/upload.service';
import { useStudioStore } from '../stores/studioStore';
import { useUIStore } from '../stores/uiStore';
import { renderWithProviders } from '../test/test-utils';
import type { MediaClip, StudioProject } from '../types/studio';
import { exportStudioProject } from '../utils/ffmpegExport';
import { StudioExportError } from '../utils/studioExportHelpers';
import { loadLocalStudioDraft } from '../utils/studioLocalDraft';
import Studio from './EditsStudio';

type Props = Record<string, any>;

/** The props each piece of the page last received. */
const seen = vi.hoisted(() => ({
  topbar: {} as Record<string, any>,
  sheet: {} as Record<string, any>,
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
vi.mock('../utils/studioLocalDraft', () => ({
  loadLocalStudioDraft: vi.fn(),
}));
vi.mock('../components/common/SEO', () => ({ default: () => null }));
vi.mock('../components/studio/StudioPlayer', () => ({ default: () => null }));
vi.mock('../components/studio/Timeline', () => ({ default: () => null }));
vi.mock('../components/studio/layout/StudioPlaybackControls', () => ({
  default: () => null,
}));
vi.mock('../components/studio/layout/StudioToolDock', () => ({
  default: () => null,
}));
vi.mock('../components/studio/layout/StudioTopbar', () => ({
  default: (props: Props) => {
    seen.topbar = props;
    return null;
  },
}));
vi.mock('../components/studio/layout/StudioToolSheet', () => ({
  default: (props: Props) => {
    seen.sheet = props;
    return null;
  },
}));
vi.mock('../components/studio/modals/ExportModal', () => ({
  default: (props: Props) => {
    seen.exportModal = props;
    return props.isOpen ? <div data-testid="export" /> : null;
  },
}));
vi.mock('../components/studio/modals/DraftsModal', () => ({
  default: ({ onClose }: Props) => (
    <button type="button" onClick={onClose}>
      close drafts
    </button>
  ),
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

const project = (clips: MediaClip[] = []): StudioProject => ({
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
    {
      id: 'audio',
      type: 'audio',
      name: 'Audio',
      clips: [],
      muted: false,
      hidden: false,
      locked: false,
    },
  ],
  createdAt: '',
  updatedAt: '',
});

/** The options the page hands to the encoder. */
const given = (options: unknown) =>
  (options ?? {}) as {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  };

const store = () => useStudioStore.getState();
const clipsOf = (trackId: string) =>
  store().project?.tracks.find((tr) => tr.id === trackId)?.clips ?? [];

/** Opens the studio on a project and waits for it to be on screen. */
async function open(initial: StudioProject | null = project()) {
  useStudioStore.setState({
    project: initial,
    cloudProjectId: null,
    selectedClipId: null,
    playhead: 0,
    isPlaying: false,
    zoom: 50,
    openSheet: null,
  });
  const view = renderWithProviders(<Studio />);
  await screen.findByRole('slider', { name: 'Timeline zoom' });
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

describe('Studio', () => {
  /** How long the browser says a picked video or sound lasts. */
  let mediaLength: number | 'unreadable';

  beforeEach(() => {
    vi.clearAllMocks();
    seen.saveNow = vi.fn();
    seen.navigate = vi.fn();
    mediaLength = 12;
    vi.mocked(loadLocalStudioDraft).mockResolvedValue(null as never);
    vi.mocked(uploadApi.upload).mockResolvedValue({
      data: { url: 'https://cdn/uploaded.mp4' },
    } as never);
    URL.createObjectURL = vi.fn(() => 'blob:local');
    URL.revokeObjectURL = vi.fn();
    // The page reads the length of a picked file from an element it never
    // puts on screen.
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
      };
      return probe;
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useStudioStore.setState({ project: null });
  });

  describe('opening', () => {
    it('starts a new project with one track of each kind when there is no draft', async () => {
      await open(null);

      expect(store().project).toMatchObject({
        name: 'New Project',
        aspectRatio: '9:16',
        duration: 10,
      });
      expect(store().project?.tracks.map((tr) => tr.type)).toEqual([
        'video',
        'text',
        'audio',
      ]);
    });

    it('goes on with the draft kept on this device, and its cloud copy', async () => {
      vi.mocked(loadLocalStudioDraft).mockResolvedValue({
        project: project([clip('kept')]),
        cloudProjectId: 'cloud-1',
      } as never);

      await open(null);

      expect(clipsOf('video').map((c) => c.id)).toEqual(['kept']);
      expect(store().cloudProjectId).toBe('cloud-1');
    });

    it('keeps the project already open, without reading the draft', async () => {
      await open(project([clip('open')]));

      expect(loadLocalStudioDraft).not.toHaveBeenCalled();
      expect(clipsOf('video').map((c) => c.id)).toEqual(['open']);
    });

    it('saves a first cloud copy once the project has media on the server', async () => {
      await open(project([clip('up', { fileUrl: 'https://cdn/up.mp4' })]));

      expect(seen.saveNow).toHaveBeenCalled();
    });

    it('does not save one for media that is only on this device', async () => {
      await open(project([clip('local')]));

      expect(seen.saveNow).not.toHaveBeenCalled();
    });
  });

  describe('the keys', () => {
    it('play and pause with space and with K', async () => {
      await open();

      press(' ');
      expect(store().isPlaying).toBe(true);
      press('k');
      expect(store().isPlaying).toBe(false);
    });

    it('move one frame with the arrows and one second with J and L, pausing', async () => {
      await open();
      act(() => useStudioStore.setState({ playhead: 5, isPlaying: true }));

      press('ArrowRight', { code: 'ArrowRight' });
      expect(store().playhead).toBeCloseTo(5.1);
      expect(store().isPlaying).toBe(false);

      press('ArrowLeft', { code: 'ArrowLeft' });
      expect(store().playhead).toBeCloseTo(5);

      press('l');
      expect(store().playhead).toBeCloseTo(6);
      press('j');
      expect(store().playhead).toBeCloseTo(5);
    });

    it('never move before the start or past the end', async () => {
      await open();

      press('j');
      expect(store().playhead).toBe(0);

      act(() => useStudioStore.setState({ playhead: 19.5 }));
      press('l');
      expect(store().playhead).toBe(20);
    });

    it('zoom the timeline between its limits', async () => {
      await open();

      press('+');
      expect(store().zoom).toBe(60);
      press('-');
      press('-');
      expect(store().zoom).toBe(40);

      act(() => useStudioStore.setState({ zoom: 195 }));
      press('=');
      expect(store().zoom).toBe(200);
      act(() => useStudioStore.setState({ zoom: 15 }));
      press('-');
      expect(store().zoom).toBe(10);
    });

    it('split and delete the selected clip, and do nothing with none selected', async () => {
      await open(project([clip('a')]));

      press('s');
      press('Delete', { code: 'Delete' });
      expect(clipsOf('video')).toHaveLength(1);

      act(() => useStudioStore.setState({ selectedClipId: 'a', playhead: 4 }));
      press('s');
      expect(clipsOf('video')).toHaveLength(2);

      act(() =>
        useStudioStore.setState({ selectedClipId: clipsOf('video')[0].id }),
      );
      press('Backspace', { code: 'Backspace' });
      expect(clipsOf('video')).toHaveLength(1);
    });

    it('open the export with E and close the open panel with Escape', async () => {
      await open();
      act(() => useStudioStore.setState({ openSheet: 'media' }));

      press('Escape', { code: 'Escape' });
      expect(store().openSheet).toBeNull();

      press('e');
      expect(screen.getByTestId('export')).toBeInTheDocument();
    });

    it('undo and redo with Control or Command', async () => {
      await open(project([clip('a')]));
      act(() => store().removeClip('a'));
      expect(clipsOf('video')).toHaveLength(0);

      press('z', { ctrlKey: true });
      expect(clipsOf('video')).toHaveLength(1);

      press('z', { metaKey: true, shiftKey: true });
      expect(clipsOf('video')).toHaveLength(0);
    });

    it.each([
      ['Command and minus (the page zoom)', '-', { metaKey: true }],
      ['Control and plus (the page zoom)', '+', { ctrlKey: true }],
      ['Command+S', 's', { metaKey: true }],
      ['Control+K', 'k', { ctrlKey: true }],
      ['Command+L', 'l', { metaKey: true }],
      ['Control+E', 'e', { ctrlKey: true }],
      ['Alt+J', 'j', { altKey: true }],
    ])('leave %s to the browser', async (_name, key, modifier) => {
      await open(project([clip('a')]));
      act(() =>
        useStudioStore.setState({ selectedClipId: 'a', playhead: 4, zoom: 50 }),
      );

      const event = press(key, modifier);

      expect(event.defaultPrevented).toBe(false);
      expect(store().zoom).toBe(50);
      expect(store().isPlaying).toBe(false);
      expect(store().playhead).toBe(4);
      expect(clipsOf('video')).toHaveLength(1);
      expect(screen.queryByTestId('export')).not.toBeInTheDocument();
    });

    it('are left alone while typing', async () => {
      await open();
      const field = document.body.appendChild(document.createElement('input'));

      fireEvent.keyDown(field, { key: ' ', code: 'Space' });

      expect(store().isPlaying).toBe(false);
      field.remove();
    });
  });

  describe('adding media', () => {
    const picked = (name: string, type: string) =>
      new File(['x'], name, { type });

    it('puts a video on the timeline at the playhead with its own length, then uploads it', async () => {
      await open();
      act(() => useStudioStore.setState({ playhead: 3 }));

      await act(() => seen.sheet.onAddMediaFile(picked('a.mp4', 'video/mp4')));

      await waitFor(() =>
        expect(clipsOf('video')[0]).toMatchObject({
          type: 'video',
          startAt: 3,
          duration: 12,
          muted: false,
          fileUrl: 'https://cdn/uploaded.mp4',
          file: null,
        }),
      );
      expect(toast.success).toHaveBeenCalledWith('Video added to timeline');
      // The copy held in memory is released once the upload is the source.
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
    });

    it('puts a picture on the timeline for three seconds, silent', async () => {
      await open();

      await act(() => seen.sheet.onAddMediaFile(picked('a.png', 'image/png')));

      await waitFor(() =>
        expect(clipsOf('video')[0]).toMatchObject({
          type: 'image',
          duration: 3,
          muted: true,
        }),
      );
      expect(toast.success).toHaveBeenCalledWith('Image added to timeline');
    });

    it('puts a sound on the audio track', async () => {
      await open();

      await act(() => seen.sheet.onAddAudioFile(picked('a.mp3', 'audio/mpeg')));

      await waitFor(() =>
        expect(clipsOf('audio')[0]).toMatchObject({
          type: 'audio',
          duration: 12,
          fileUrl: 'https://cdn/uploaded.mp4',
        }),
      );
      expect(clipsOf('video')).toHaveLength(0);
      expect(toast.success).toHaveBeenCalledWith('Audio track added');
    });

    it('adds nothing and says so when the file cannot be read', async () => {
      mediaLength = 'unreadable';
      await open();

      await act(() => seen.sheet.onAddMediaFile(picked('a.mp4', 'video/mp4')));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not upload media'),
      );
      expect(clipsOf('video')).toHaveLength(0);
      expect(uploadApi.upload).not.toHaveBeenCalled();
    });

    it('says so when the upload fails', async () => {
      vi.mocked(uploadApi.upload).mockRejectedValue(new Error('offline'));
      await open();

      await act(() => seen.sheet.onAddMediaFile(picked('a.png', 'image/png')));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Could not upload media'),
      );
    });

    it('holds export back while a file is uploading', async () => {
      let finish: (value: unknown) => void = () => {};
      vi.mocked(uploadApi.upload).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
      );
      await open();

      act(() => {
        seen.sheet.onAddMediaFile(picked('a.png', 'image/png'));
      });
      await waitFor(() => expect(seen.topbar.isExporting).toBe(true));

      await act(async () => finish({ data: { url: 'https://cdn/a.png' } }));
      await waitFor(() => expect(seen.topbar.isExporting).toBe(false));
    });
  });

  describe('tracks and the selected clip', () => {
    it('adds a track of the chosen kind and says which', async () => {
      await open();

      fireEvent.click(screen.getByRole('button', { name: 'Add text track' }));

      expect(store().project?.tracks.at(-1)).toMatchObject({
        type: 'text',
        name: 'Text',
        clips: [],
      });
      expect(toast.success).toHaveBeenCalledWith('Text track added');
    });

    it('enables split and delete only with a clip selected', async () => {
      await open(project([clip('a')]));
      const remove = screen.getByTitle('Delete');
      expect(remove).toBeDisabled();

      act(() => useStudioStore.setState({ selectedClipId: 'a' }));
      fireEvent.click(remove);

      expect(clipsOf('video')).toHaveLength(0);
    });

    it('changes the zoom from its slider', async () => {
      await open();

      fireEvent.change(screen.getByRole('slider', { name: 'Timeline zoom' }), {
        target: { value: '120' },
      });

      expect(store().zoom).toBe(120);
    });
  });

  describe('exporting', () => {
    const video = new Blob(['video'], { type: 'video/mp4' });

    it('encodes the project with the chosen quality and shows its progress', async () => {
      vi.mocked(exportStudioProject).mockImplementation(async (_p, options) => {
        given(options).onProgress?.(40);
        return video as never;
      });
      await open(project([clip('a')]));
      act(() => seen.topbar.onExport());

      await act(async () => seen.exportModal.onStartExport('fast'));

      expect(exportStudioProject).toHaveBeenCalledWith(
        store().project,
        expect.objectContaining({ preset: 'fast' }),
      );
      await waitFor(() => expect(seen.exportModal.exportedBlob).toBe(video));
      expect(seen.exportModal.isExporting).toBe(false);
    });

    it('stops the encoding when the export is cancelled, and closes', async () => {
      vi.mocked(exportStudioProject).mockImplementation(
        (_p, options) =>
          new Promise((_resolve, reject) => {
            given(options).signal?.addEventListener('abort', () =>
              reject(new StudioExportError('studio.export_errors.cancelled')),
            );
          }) as never,
      );
      await open(project([clip('a')]));
      act(() => seen.topbar.onExport());
      act(() => {
        seen.exportModal.onStartExport('fast');
      });
      await waitFor(() => expect(seen.exportModal.isExporting).toBe(true));

      act(() => seen.exportModal.onCancelExport());

      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith('Export cancelled'),
      );
      expect(screen.queryByTestId('export')).not.toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('stops the encoding when the studio is left', async () => {
      let signal: AbortSignal | undefined;
      vi.mocked(exportStudioProject).mockImplementation((_p, options) => {
        signal = given(options).signal;
        return new Promise(() => {}) as never;
      });
      const { unmount } = await open(project([clip('a')]));
      act(() => {
        seen.exportModal.onStartExport('fast');
      });
      await waitFor(() => expect(signal).toBeDefined());

      unmount();

      expect(signal?.aborted).toBe(true);
    });

    it.each([
      [
        'a known reason',
        new StudioExportError('studio.export_errors.no_clips'),
        'Add a video or image clip before exporting',
      ],
      [
        'anything else',
        new Error('boom'),
        'Error exporting the video. Please try again.',
      ],
    ])(
      'says why when it fails for %s, and stays open',
      async (_why, error, message) => {
        vi.mocked(exportStudioProject).mockRejectedValue(error);
        await open(project([clip('a')]));
        act(() => seen.topbar.onExport());

        await act(async () => seen.exportModal.onStartExport('fast'));

        expect(toast.error).toHaveBeenCalledWith(message);
        expect(screen.getByTestId('export')).toBeInTheDocument();
      },
    );

    it('cannot be closed while it is encoding', async () => {
      vi.mocked(exportStudioProject).mockReturnValue(
        new Promise(() => {}) as never,
      );
      await open(project([clip('a')]));
      act(() => seen.topbar.onExport());
      act(() => {
        seen.exportModal.onStartExport('fast');
      });
      await waitFor(() => expect(seen.exportModal.isExporting).toBe(true));

      act(() => seen.exportModal.onClose());

      expect(screen.getByTestId('export')).toBeInTheDocument();
    });

    it('hands the video to the composer as a frame, with its date when scheduled', async () => {
      vi.mocked(exportStudioProject).mockResolvedValue(video as never);
      await open(project([clip('a')]));
      act(() => seen.topbar.onExport());
      await act(async () => seen.exportModal.onStartExport('fast'));
      await waitFor(() => expect(seen.exportModal.exportedBlob).toBe(video));

      await act(async () => seen.exportModal.onPublish('2026-12-01T10:00'));

      const handed = useUIStore.getState().editedMediaForPost;
      expect(handed?.file).toBeInstanceOf(File);
      expect(handed?.file.type).toBe('video/mp4');
      expect(handed?.scheduledAt).toBe('2026-12-01T10:00');
      expect(seen.navigate).toHaveBeenCalledWith('/create?mode=frame');
    });

    it('downloads the video and closes', async () => {
      vi.mocked(exportStudioProject).mockResolvedValue(video as never);
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      await open(project([clip('a')]));
      act(() => seen.topbar.onExport());
      await act(async () => seen.exportModal.onStartExport('fast'));
      await waitFor(() => expect(seen.exportModal.exportedBlob).toBe(video));

      act(() => seen.exportModal.onDownload());

      expect(click).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
      expect(screen.queryByTestId('export')).not.toBeInTheDocument();
    });
  });

  it('saves on request and opens and closes the drafts', async () => {
    await open();

    act(() => seen.topbar.onSave());
    expect(seen.saveNow).toHaveBeenCalledTimes(1);

    act(() => seen.topbar.onOpenDrafts());
    fireEvent.click(screen.getByRole('button', { name: 'close drafts' }));
    expect(
      screen.queryByRole('button', { name: 'close drafts' }),
    ).not.toBeInTheDocument();
  });
});
