import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { probeVideoDuration } from '../constants/uploadLimits';
import { useCloseFriendsList } from '../hooks/useCloseFriendsList';
import { renderWithProviders } from '../test/test-utils';
import ContentComposerPage from './ContentComposerPage';

type Props = Record<string, any>;

/** What the composer hook holds; each test sets what it needs. */
const composer = vi.hoisted(() => ({ state: {} as Record<string, any> }));
/** The props each piece of the screen last received. */
const seen = vi.hoisted(() => ({
  overlay: {} as Record<string, any>,
  subScreen: {} as Record<string, any>,
  upload: {} as Record<string, any>,
  edit: {} as Record<string, any>,
  caption: {} as Record<string, any>,
  storyBar: {} as Record<string, any>,
  title: '',
}));

vi.mock('../hooks/useCreatePost', () => ({
  useCreatePost: () => composer.state,
}));
vi.mock('../hooks/useCloseFriendsList', () => ({
  useCloseFriendsList: vi.fn(() => ({ closeFriendsCount: 4 })),
}));
vi.mock('../constants/uploadLimits', () => ({
  probeVideoDuration: vi.fn(),
}));
vi.mock('./common/SEO', () => ({
  default: ({ title }: { title: string }) => {
    seen.title = title;
    return null;
  },
}));
vi.mock('./create-post/ComposerChrome', () => ({
  default: ({ children, size, ...rest }: Props) => (
    <div data-testid="chrome" data-size={size} {...rest}>
      {children}
    </div>
  ),
}));
vi.mock('./create-post/StepAnimationWrapper.tsx', () => ({
  default: ({ children }: Props) => <>{children}</>,
}));
vi.mock('./create-post/EditorOverlayManager', () => ({
  default: (props: Props) => {
    seen.overlay = props;
    return props.showStoryComposer ||
      props.showFrameTrim ||
      props.currentEditIndex !== null ? (
      <div data-testid="editor" />
    ) : null;
  },
}));
vi.mock('./create-post/SubScreenRouter', () => ({
  default: (props: Props) => {
    seen.subScreen = props;
    return <div data-testid="sub-screen">{props.subScreen}</div>;
  },
}));
vi.mock('./create-post/UploadStep', () => ({
  default: (props: Props) => {
    seen.upload = props;
    return <div data-testid="upload-step" />;
  },
}));
vi.mock('./create-post/EditStep', () => ({
  default: (props: Props) => {
    seen.edit = props;
    return <div data-testid="edit-step" />;
  },
}));
vi.mock('./create-post/CaptionStep', () => ({
  default: (props: Props) => {
    seen.caption = props;
    return <div data-testid="caption-step" />;
  },
}));
vi.mock('./create-post/StoryControlsBar', () => ({
  default: (props: Props) => {
    seen.storyBar = props;
    return <div data-testid="story-bar" />;
  },
}));

const photo = { type: 'image', file: new File(['x'], 'a.jpg') };
const clip = (videoData?: { startTime: number; endTime: number }) => ({
  type: 'video',
  file: new File(['x'], 'a.mp4'),
  videoData,
});

function compose(state: Record<string, unknown> = {}, address = '/create') {
  const actions = [
    'setMode',
    'setStep',
    'setSubScreen',
    'setMediaFiles',
    'setCurrentEditIndex',
    'handleFrameTrimConfirm',
    'handleFrameTrimCancel',
    'setShowDiscardConfirm',
    'confirmDiscard',
    'setCaption',
    'setLocation',
    'setSelectedPlace',
    'setHideLikes',
    'setTurnOffComments',
    'setIsSensitive',
    'setSelectedAudio',
    'setAudioStartMs',
    'setIsCloseFriendsOnly',
    'setAltTextMap',
    'setTagsMap',
    'handleFileSelect',
    'handleFilterSave',
    'handleRemoveFile',
    'handleMoveFile',
    'handleSubmit',
    'reset',
    'generateAltTextForIndex',
    'setStoryElements',
    'setStoryBgStyle',
    'setIsComposed',
    'setOriginalStoryMedia',
    'setIsPremium',
    'setPrice',
    'setScheduledAt',
    'setInteractiveDraft',
  ];
  composer.state = {
    mode: 'POST',
    step: 'upload',
    subScreen: 'none',
    mediaFiles: [],
    currentEditIndex: null,
    showFrameTrim: false,
    showDiscardConfirm: false,
    caption: '',
    location: '',
    selectedAudio: null,
    audioStartMs: 0,
    isComposed: false,
    isPending: false,
    isProcessingEdit: false,
    fileInputRef: { current: null },
    ...Object.fromEntries(actions.map((name) => [name, vi.fn()])),
    ...state,
  };
  const view = renderWithProviders(<ContentComposerPage />, {
    routerProps: { initialEntries: [address] },
  });
  return { hook: composer.state, ...view };
}

describe('ContentComposerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(probeVideoDuration).mockResolvedValue(8);
  });

  describe('what it is called', () => {
    it.each([
      ['POST', 'New Post', 'CircleSfera — New Post'],
      ['FRAME', 'New Frame', 'CircleSfera — New Frame'],
      ['STORY', 'Add to Story', 'CircleSfera — Add to Story'],
    ])('%s', (mode, heading, tabTitle) => {
      compose({ mode });

      expect(screen.getByText(heading)).toBeInTheDocument();
      expect(seen.title).toBe(tabTitle);
      expect(screen.getByTestId('content-composer')).toHaveAttribute(
        'data-create-mode',
        mode,
      );
    });
  });

  describe('choosing what to create', () => {
    it('lets the kind be changed when the composer was opened plainly', () => {
      compose();

      expect(seen.upload.allowModeSwitch).toBe(true);
    });

    it.each(['post', 'story', 'frame', 'circle'])(
      'keeps the kind chosen on the way in: %s',
      (mode) => {
        compose({}, `/create?mode=${mode}`);

        expect(seen.upload.allowModeSwitch).toBe(false);
      },
    );

    it('ignores a kind it does not know', () => {
      compose({}, '/create?mode=whatever');

      expect(seen.upload.allowModeSwitch).toBe(true);
    });
  });

  describe('moving through the steps', () => {
    it('cannot go on without media', () => {
      compose({ step: 'edit' });

      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    it('goes from editing a post to its caption', () => {
      const { hook } = compose({ step: 'edit', mediaFiles: [photo] });

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));

      expect(hook.setStep).toHaveBeenCalledWith('caption');
      expect(hook.handleSubmit).not.toHaveBeenCalled();
    });

    it('shares a post from the caption step', () => {
      const { hook } = compose({ step: 'caption', mediaFiles: [photo] });
      expect(screen.getByTestId('content-composer')).toHaveAttribute(
        'data-size',
        'wide',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Share' }));

      expect(hook.handleSubmit).toHaveBeenCalledTimes(1);
    });

    it('shares a story straight from editing: it has no caption step', () => {
      const { hook } = compose({
        mode: 'STORY',
        step: 'edit',
        mediaFiles: [clip()],
      });

      fireEvent.click(screen.getByRole('button', { name: 'Share' }));

      expect(hook.handleSubmit).toHaveBeenCalledTimes(1);
      expect(hook.setStep).not.toHaveBeenCalled();
    });

    it('does not share a caption over 2200 characters', () => {
      compose({
        step: 'caption',
        mediaFiles: [photo],
        caption: 'a'.repeat(2201),
      });

      expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
    });

    it('shares a caption of exactly 2200 characters', () => {
      compose({
        step: 'caption',
        mediaFiles: [photo],
        caption: 'a'.repeat(2200),
      });

      expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
    });

    it('goes back by starting over', () => {
      const { hook } = compose({ step: 'edit', mediaFiles: [photo] });

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(hook.reset).toHaveBeenCalledTimes(1);
    });

    it('clears the composed story on the way back to the first step', () => {
      const { hook } = compose({ step: 'upload' });

      expect(hook.setIsComposed).toHaveBeenCalledWith(false);
    });
  });

  describe('stories', () => {
    it('opens the story editor as soon as a photo is chosen', async () => {
      compose({ mode: 'STORY', step: 'edit', mediaFiles: [photo] });

      expect(await screen.findByTestId('editor')).toBeInTheDocument();
      expect(seen.overlay.showStoryComposer).toBe(true);
      expect(screen.queryByTestId('content-composer')).not.toBeInTheDocument();
    });

    it('does not open it again once the story is composed', () => {
      compose({
        mode: 'STORY',
        step: 'edit',
        mediaFiles: [photo],
        isComposed: true,
      });

      expect(screen.queryByTestId('editor')).not.toBeInTheDocument();
      expect(screen.getByTestId('story-bar')).toBeInTheDocument();
      expect(seen.storyBar.closeFriendsCount).toBe(4);
    });

    it('goes back to the story editor, keeping the composed story', async () => {
      const { hook } = compose({
        mode: 'STORY',
        step: 'edit',
        mediaFiles: [photo],
        isComposed: true,
      });

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(await screen.findByTestId('editor')).toBeInTheDocument();
      expect(hook.reset).not.toHaveBeenCalled();
    });

    it('opens the editor from the media of a composed story', async () => {
      compose({
        mode: 'STORY',
        step: 'edit',
        mediaFiles: [photo],
        isComposed: true,
      });

      act(() => seen.edit.onEditMedia());

      expect(await screen.findByTestId('editor')).toBeInTheDocument();
    });

    it('starts a text story from the first step', async () => {
      compose({ mode: 'STORY' });

      act(() => seen.upload.onTextStory());

      expect(await screen.findByTestId('editor')).toBeInTheDocument();
    });

    it('opens music, place and close friends from the story bar', () => {
      const { hook } = compose({
        mode: 'STORY',
        step: 'edit',
        mediaFiles: [clip()],
      });

      seen.storyBar.onOpenMusic();
      seen.storyBar.onOpenLocation();
      seen.storyBar.onManageCloseFriends();

      expect(hook.setSubScreen.mock.calls).toEqual([
        ['music'],
        ['location'],
        ['close_friends'],
      ]);
    });

    it('only loads the close friends for a story', () => {
      compose({ mode: 'POST' }).unmount();
      expect(useCloseFriendsList).toHaveBeenLastCalledWith(false);

      compose({ mode: 'STORY' });
      expect(useCloseFriendsList).toHaveBeenLastCalledWith(true);
    });

    it('has no sensitive-content switch', () => {
      compose({ mode: 'STORY', subScreen: 'advanced' }).unmount();
      expect(seen.subScreen.showSensitiveToggle).toBe(false);

      compose({ mode: 'POST', subScreen: 'advanced' });
      expect(seen.subScreen.showSensitiveToggle).toBe(true);
    });
  });

  describe('the editors', () => {
    it('shows the photo editor alone while a photo is being edited', () => {
      compose({ step: 'edit', mediaFiles: [photo], currentEditIndex: 0 });

      expect(screen.getByTestId('editor')).toBeInTheDocument();
      expect(screen.queryByTestId('content-composer')).not.toBeInTheDocument();
    });

    it('opens the photo editor on the tool chosen on the edit step', () => {
      const { rerender } = compose({ step: 'edit', mediaFiles: [photo] });

      act(() => seen.edit.onChooseEditorTab('filters'));
      composer.state = { ...composer.state, currentEditIndex: 0 };
      rerender(<ContentComposerPage />);

      expect(seen.overlay.initialEditorTab).toBe('filters');
    });

    it('limits the length of the video only for a frame', () => {
      const frame = compose({ mode: 'FRAME', showFrameTrim: true });
      expect(seen.overlay.constrainFrameDuration).toBe(true);
      expect(screen.getByTestId('editor')).toBeInTheDocument();
      frame.unmount();

      compose({ mode: 'POST', mediaFiles: [clip()], currentEditIndex: 0 });
      expect(seen.overlay.constrainFrameDuration).toBe(false);
    });
  });

  describe('the secondary screens', () => {
    it('show alone, in a card of their own size', () => {
      compose({ subScreen: 'location', mediaFiles: [photo], step: 'caption' });

      expect(screen.getByTestId('sub-screen')).toHaveTextContent('location');
      expect(screen.getByTestId('chrome')).toHaveAttribute('data-size', 'fit');
      expect(screen.queryByTestId('caption-step')).not.toBeInTheDocument();
    });

    it('keep the track and where it starts together', () => {
      const { hook } = compose({ subScreen: 'music' });

      seen.subScreen.setSelectedAudio({
        audio: { id: 'track-1' },
        audioStartMs: 12_000,
      });
      expect(hook.setSelectedAudio).toHaveBeenLastCalledWith({ id: 'track-1' });
      expect(hook.setAudioStartMs).toHaveBeenLastCalledWith(12_000);

      seen.subScreen.setSelectedAudio(null);
      expect(hook.setSelectedAudio).toHaveBeenLastCalledWith(null);
      expect(hook.setAudioStartMs).toHaveBeenLastCalledWith(0);
    });

    it('take the track off from the caption step, back to its start', () => {
      const { hook } = compose({ step: 'caption', mediaFiles: [photo] });

      seen.caption.onClearAudio();
      seen.caption.onOpenMusic();

      expect(hook.setSelectedAudio).toHaveBeenCalledWith(null);
      expect(hook.setAudioStartMs).toHaveBeenCalledWith(0);
      expect(hook.setSubScreen).toHaveBeenCalledWith('music');
    });
  });

  describe('how much of a track fits', () => {
    const windowMs = () => seen.subScreen.clipWindowMs;

    it('is the trimmed part of the video', async () => {
      compose({
        subScreen: 'music',
        mediaFiles: [clip({ startTime: 2, endTime: 6.5 })],
      });

      await waitFor(() => expect(windowMs()).toBe(4500));
      expect(probeVideoDuration).not.toHaveBeenCalled();
    });

    it('is the whole video when it has not been trimmed', async () => {
      compose({ subScreen: 'music', mediaFiles: [clip()] });

      await waitFor(() => expect(windowMs()).toBe(8000));
    });

    it('is never under a second', async () => {
      vi.mocked(probeVideoDuration).mockResolvedValue(0.2);
      compose({ subScreen: 'music', mediaFiles: [clip()] });

      await waitFor(() => expect(windowMs()).toBe(1000));
    });

    it('is five seconds for a story with a photo', async () => {
      compose({
        mode: 'STORY',
        subScreen: 'music',
        mediaFiles: [photo],
        isComposed: true,
      });

      await waitFor(() => expect(windowMs()).toBe(5000));
    });

    it('is fifteen seconds for a post with photos, or when the video cannot be read', async () => {
      vi.mocked(probeVideoDuration).mockRejectedValue(new Error('unreadable'));
      compose({ subScreen: 'music', mediaFiles: [clip()] });

      await waitFor(() => expect(probeVideoDuration).toHaveBeenCalled());
      expect(windowMs()).toBe(15_000);
    });
  });

  describe('leaving with changes', () => {
    it('asks first, and discards only on confirming', () => {
      const { hook } = compose({
        step: 'edit',
        mediaFiles: [photo],
        showDiscardConfirm: true,
      });
      expect(screen.getByText('Discard post?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(hook.setShowDiscardConfirm).toHaveBeenCalledWith(false);
      expect(hook.confirmDiscard).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(hook.confirmDiscard).toHaveBeenCalledTimes(1);
    });
  });
});
