import { act, screen } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '../../hooks/useCreatePost';
import { renderInComposer } from '../../test/composer';
import EditorOverlayManager from './EditorOverlayManager';

type Props = Record<string, any>;

/** The props each editor last received. */
const seen = vi.hoisted(() => ({
  trim: {} as Record<string, any>,
  photo: {} as Record<string, any>,
  story: {} as Record<string, any>,
}));

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn() } }));
vi.mock('./FrameTrimOverlay', () => ({
  default: (props: Props) => {
    seen.trim = props;
    return <div data-testid="trim" />;
  },
}));
vi.mock('../PhotoEditor', () => ({
  default: (props: Props) => {
    seen.photo = props;
    return <div data-testid="photo-editor" />;
  },
}));
vi.mock('../story/StoryComposer', () => ({
  default: (props: Props) => {
    seen.story = props;
    return <div data-testid="story-composer" />;
  },
}));
vi.mock('../common/BrandAmbientBackground', () => ({ default: () => null }));

const media = (
  type: 'image' | 'video',
  over: Partial<MediaFile> = {},
): MediaFile => ({
  file: new File(['x'], `a.${type === 'video' ? 'mp4' : 'jpg'}`),
  url: `blob:${type}`,
  type,
  ...over,
});

/** What the page itself holds; the rest comes from the composer. */
const OF_THE_PAGE = ['showStoryComposer', 'initialEditorTab'];

function show(more: Props = {}) {
  const props = {
    mode: 'POST',
    showStoryComposer: false,
    setShowStoryComposer: vi.fn(),
    currentEditIndex: null,
    setCurrentEditIndex: vi.fn(),
    showFrameTrim: false,
    frameSourceDurationSec: 0,
    mediaFiles: [] as MediaFile[],
    setMediaFiles: vi.fn(),
    setIsComposed: vi.fn(),
    setStep: vi.fn(),
    originalStoryMedia: null,
    setOriginalStoryMedia: vi.fn(),
    storyElements: [],
    storyBgStyle: '',
    setStoryElements: vi.fn(),
    setStoryBgStyle: vi.fn(),
    handleFilterSave: vi.fn(),
    handleFrameTrimConfirm: vi.fn(),
    handleFrameTrimCancel: vi.fn(),
    isProcessingEdit: false,
    ...more,
  };
  const composer = Object.fromEntries(
    Object.entries(props).filter(([key]) => !OF_THE_PAGE.includes(key)),
  );
  const view = renderInComposer(
    <EditorOverlayManager
      showStoryComposer={props.showStoryComposer}
      setShowStoryComposer={props.setShowStoryComposer}
      initialEditorTab={(more as Props).initialEditorTab}
    />,
    composer,
  );
  return { props, ...view };
}

describe('EditorOverlayManager', () => {
  beforeEach(() => {
    seen.trim = {};
    seen.photo = {};
    seen.story = {};
    URL.createObjectURL = vi.fn(() => 'blob:made');
  });

  it('shows nothing when no editor is open', () => {
    const { container } = show();

    expect(container).toBeEmptyDOMElement();
  });

  describe('the trim of a frame', () => {
    it('opens on the part already chosen', () => {
      show({
        showFrameTrim: true,
        frameSourceDurationSec: 200,
        mediaFiles: [
          media('video', {
            videoData: { startTime: 5, endTime: 35, muted: true },
          }),
        ],
      });

      expect(screen.getByTestId('trim')).toBeInTheDocument();
      expect(seen.trim).toMatchObject({
        url: 'blob:video',
        sourceDurationSec: 200,
        initialWindow: { startTime: 5, endTime: 35 },
        muted: true,
      });
    });

    it('starts on the first ninety seconds, or on the whole video when it is shorter', () => {
      const long = show({
        showFrameTrim: true,
        frameSourceDurationSec: 200,
        mediaFiles: [media('video')],
      });
      expect(seen.trim.initialWindow).toEqual({ startTime: 0, endTime: 90 });
      long.unmount();

      show({
        showFrameTrim: true,
        frameSourceDurationSec: 40,
        mediaFiles: [media('video')],
      });
      expect(seen.trim.initialWindow).toEqual({ startTime: 0, endTime: 40 });
    });

    it('does not open for a photo', () => {
      show({ showFrameTrim: true, mediaFiles: [media('image')] });

      expect(screen.queryByTestId('trim')).toBeNull();
    });
  });

  describe('the story editor', () => {
    it('opens on the original photo, not on the composed one', async () => {
      const original = {
        file: new File(['o'], 'o.jpg'),
        url: 'blob:o',
        type: 'image' as const,
      };
      show({ showStoryComposer: true, originalStoryMedia: original });

      expect(await screen.findByTestId('story-composer')).toBeInTheDocument();
      expect(seen.story.initialMedia).toBe(original.file);
    });

    it('replaces the media with the composed story and goes to the edit step', async () => {
      const { props } = show({ showStoryComposer: true });
      await screen.findByTestId('story-composer');

      await act(() => seen.story.onPost(new Blob(['png'])));

      const [[files]] = props.setMediaFiles.mock.calls;
      expect(files).toHaveLength(1);
      expect(files[0]).toMatchObject({ url: 'blob:made', type: 'image' });
      expect(files[0].file.name).toBe('story_composed.png');
      expect(props.setIsComposed).toHaveBeenCalledWith(true);
      expect(props.setShowStoryComposer).toHaveBeenCalledWith(false);
      expect(props.setStep).toHaveBeenCalledWith('edit');
    });

    it('keeps a story as composed when the editor is closed with media in it', async () => {
      const { props } = show({
        showStoryComposer: true,
        mediaFiles: [media('image')],
      });
      await screen.findByTestId('story-composer');

      seen.story.onClose();

      expect(props.setShowStoryComposer).toHaveBeenCalledWith(false);
      expect(props.setIsComposed).toHaveBeenCalledWith(true);
    });

    it('does not mark anything as composed when it is closed empty', async () => {
      const { props } = show({ showStoryComposer: true });
      await screen.findByTestId('story-composer');

      seen.story.onClose();

      expect(props.setIsComposed).not.toHaveBeenCalled();
    });

    it('keeps a new background as the original, a video as a video', async () => {
      const { props } = show({ showStoryComposer: true });
      await screen.findByTestId('story-composer');
      const clip = new File(['v'], 'v.mp4', { type: 'video/mp4' });

      seen.story.onBackgroundChange(clip);

      expect(props.setOriginalStoryMedia).toHaveBeenCalledWith({
        file: clip,
        url: 'blob:made',
        type: 'video',
      });
    });
  });

  describe('the photo editor', () => {
    it('opens on the chosen file with the edit it already had', async () => {
      const second = media('image', { filter: 'sepia' });
      show({ currentEditIndex: 1, mediaFiles: [media('image'), second] });

      expect(await screen.findByTestId('photo-editor')).toBeInTheDocument();
      expect(seen.photo.image).toBe(second.file);
      expect(seen.photo.initialState).toMatchObject({ filter: 'sepia' });
    });

    it('opens on the filter of the saved look, not on the whole look', async () => {
      show({
        currentEditIndex: 0,
        mediaFiles: [
          media('image', {
            filter:
              'filter-class:sepia__style:brightness(120%)__temp:100__vignette:0__noise:0',
          }),
        ],
      });
      await screen.findByTestId('photo-editor');

      expect(seen.photo.initialState.filter).toBe('sepia');
    });

    it('opens where it was left: crop, shape, adjustments and drawing', async () => {
      const editorState = {
        filter: 'sepia',
        adjustments: { brightness: 120 },
        cropData: { x: 1, y: 2, width: 30, height: 40, rotation: 90 },
        aspect: 1,
        overlays: [{ id: 'a', type: 'text', text: 'hola', x: 0, y: 0 }],
      };
      const videoData = { startTime: 2, endTime: 9, muted: true };
      show({
        currentEditIndex: 0,
        mediaFiles: [
          media('video', {
            editorState: {
              ...editorState,
              videoData: { startTime: 0, endTime: 5, muted: false },
            } as never,
            videoData,
          }),
        ],
      });
      await screen.findByTestId('photo-editor');

      // The clip window can change on the trim screen too, so it comes
      // from the item.
      expect(seen.photo.initialState).toEqual({ ...editorState, videoData });
    });

    it('leaves the editor on cancel', async () => {
      const { props } = show({
        currentEditIndex: 0,
        mediaFiles: [media('image')],
      });
      await screen.findByTestId('photo-editor');

      seen.photo.onCancel();

      expect(props.setCurrentEditIndex).toHaveBeenCalledWith(null);
    });

    it('opens the video of a frame on its trim, limited to the length of a frame', async () => {
      show({
        currentEditIndex: 0,
        mediaFiles: [media('video')],
        mode: 'FRAME',
      });
      await screen.findByTestId('photo-editor');

      expect(seen.photo.initialTab).toBe('TRIM');
      expect(seen.photo.constrainDuration).toEqual({ min: 15, max: 90 });
    });

    it('opens on the tool that was asked for', async () => {
      show({
        currentEditIndex: 0,
        mediaFiles: [media('video')],
        mode: 'FRAME',
        initialEditorTab: 'FILTERS',
      });
      await screen.findByTestId('photo-editor');

      expect(seen.photo.initialTab).toBe('FILTERS');
    });

    it('does not limit the length of a video in a post', async () => {
      show({ currentEditIndex: 0, mediaFiles: [media('video')] });
      await screen.findByTestId('photo-editor');

      expect(seen.photo.initialTab).toBeUndefined();
      expect(seen.photo.constrainDuration).toBeUndefined();
    });

    it('applies a filter to every other file of a carousel, and says so', async () => {
      const files = [media('image'), media('image', { url: 'blob:b' })];
      const { props } = show({ currentEditIndex: 0, mediaFiles: files });
      await screen.findByTestId('photo-editor');

      seen.photo.onApplyToAll('sepia', {
        filter: 'sepia',
        adjustments: { brightness: 110 },
      });

      const [[next]] = props.setMediaFiles.mock.calls;
      // The one being edited keeps what its own editor decides.
      expect(next[0].filter).toBeUndefined();
      expect(next[1].filter).toBe('sepia');
      // The others open on that look next time.
      expect(next[1].editorState).toEqual({
        filter: 'sepia',
        adjustments: { brightness: 110 },
      });
      expect(toast.success).toHaveBeenCalledWith(
        'Filters applied to all files',
      );
    });

    it('does not offer applying to all for a single file', async () => {
      show({ currentEditIndex: 0, mediaFiles: [media('image')] });
      await screen.findByTestId('photo-editor');

      expect(seen.photo.onApplyToAll).toBeUndefined();
    });

    it('says so while an edit is being applied', async () => {
      show({
        currentEditIndex: 0,
        mediaFiles: [media('image')],
        isProcessingEdit: true,
      });

      expect(await screen.findByText('Processing media…')).toBeInTheDocument();
    });
  });
});
