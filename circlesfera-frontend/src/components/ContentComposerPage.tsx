import { AnimatePresence } from 'framer-motion';
import React from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { probeVideoDuration } from '../constants/uploadLimits';
import { useCloseFriendsList } from '../hooks/useCloseFriendsList';
import { useCreatePost } from '../hooks/useCreatePost';
import { useWideScreen } from '../hooks/useWideScreen';
import { hasDeviceGallery } from '../utils/photoLibrary';
import BrandAmbientBackground from './common/BrandAmbientBackground';
import SEO from './common/SEO';
import CaptionStep from './create-post/CaptionStep';
import ComposerChrome from './create-post/ComposerChrome';
import { ComposerProvider } from './create-post/ComposerContext';
import { CREATE_FULL_SCREEN } from './create-post/createStyles';
import EditorOverlayManager from './create-post/EditorOverlayManager';
import EditStep from './create-post/EditStep';
import Header from './create-post/Header';
import StepAnimationWrapper from './create-post/StepAnimationWrapper.tsx';
import StoryControlsBar from './create-post/StoryControlsBar';
import SubScreenRouter from './create-post/SubScreenRouter';
import UploadStep from './create-post/UploadStep';
import ConfirmModal from './modals/ConfirmModal';
import type { PhotoEditorTab } from './photo-editor/photoEditor.types';
import StoryCapture from './story/capture/StoryCapture';
import { pictureFile, readStoryStart } from './story/storyStart';

const STEP_ORDER = ['upload', 'edit', 'caption'] as const;

export default function ContentComposerPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  // Explicit entry from CreateBottomSheet locks mode switcher
  const modeLockedFromEntry =
    modeParam === 'post' ||
    modeParam === 'story' ||
    modeParam === 'frame' ||
    modeParam === 'circle';

  const [stepDirection, setStepDirection] = React.useState(1);
  const [showStoryComposer, setShowStoryComposer] = React.useState(false);
  // Creating starts on the camera; the gallery opens over it.
  const [showPicker, setShowPicker] = React.useState(false);
  // The gallery opened by itself because there is no camera: back leaves.
  const [pickerIsStart, setPickerIsStart] = React.useState(false);
  // On a computer a post or a Frame starts on the gallery, as on the web
  // version of other apps; the camera is a button of the upload step there.
  const wideScreen = useWideScreen();
  // Live mode of the camera, before going on to start the live.
  const [liveMode, setLiveMode] = React.useState(false);
  // The tab the photo editor opens on, chosen from the tools of the edit step.
  const [editorTab, setEditorTab] = React.useState<PhotoEditorTab | undefined>(
    undefined,
  );
  const [clipWindowMs, setClipWindowMs] = React.useState(15_000);
  // In the iOS app, how "Next" continues from the gallery of the upload step.
  const [galleryNext, setGalleryNext] = React.useState<(() => void) | null>(
    null,
  );
  const onGalleryNextChange = React.useCallback(
    (proceed: (() => void) | null) => setGalleryNext(() => proceed),
    [],
  );

  const composer = useCreatePost();
  const {
    mode,
    setMode,
    postShape,
    setPostShape,
    step,
    setStep,
    subScreen,
    setSubScreen,
    mediaFiles,
    currentEditIndex,
    setCurrentEditIndex,
    showFrameTrim,
    showDiscardConfirm,
    setShowDiscardConfirm,
    confirmDiscard,
    caption,
    setCaption,
    location,
    coverTimeMs,
    selectedAudio,
    setSelectedAudio,
    setAudioStartMs,
    isCloseFriendsOnly,
    setIsCloseFriendsOnly,
    fileInputRef,
    handleFileSelect,
    handleRemoveFile,
    handleMoveFile,
    handleQuickFilter,
    handleSubmit,
    reset,
    isComposed,
    setIsComposed,
    isPremium,
    interactiveDraft,
    isPending,
  } = composer;

  const isStoryMode = mode === 'STORY';
  const galleryFirst = wideScreen && !isStoryMode;

  // A story started from another (an answer shared, a mention added to one's
  // own story) opens the editor with what it starts from. The route forgets
  // it, so going back here starts afresh.
  const routerLocation = useLocation();
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = React.useState(() =>
    Boolean(readStoryStart(routerLocation.state)),
  );
  const startedRef = React.useRef(false);
  const { setStoryElements, setOriginalStoryMedia, setStoryBgStyle } = composer;
  React.useEffect(() => {
    const start = readStoryStart(routerLocation.state);
    if (!start || startedRef.current) return;
    startedRef.current = true;
    navigate(`${routerLocation.pathname}${routerLocation.search}`, {
      replace: true,
      state: null,
    });
    void (async () => {
      setStoryElements(start.elements);
      if (start.backgroundUrl) {
        try {
          const file = await pictureFile(start.backgroundUrl);
          setOriginalStoryMedia({
            file,
            url: URL.createObjectURL(file),
            type: 'image',
          });
          setStoryBgStyle('');
        } catch {
          toast.error(t('story.start_picture_error'));
        }
      }
      setShowStoryComposer(true);
      setIsStarting(false);
    })();
  }, [
    routerLocation,
    navigate,
    setStoryElements,
    setOriginalStoryMedia,
    setStoryBgStyle,
    t,
  ]);

  const { closeFriendsCount } = useCloseFriendsList(isStoryMode);

  React.useEffect(() => {
    let cancelled = false;

    const resolveClipWindow = async () => {
      const video = mediaFiles.find((m) => m.type === 'video');
      if (
        video?.videoData &&
        video.videoData.endTime > video.videoData.startTime
      ) {
        const ms = Math.round(
          (video.videoData.endTime - video.videoData.startTime) * 1000,
        );
        if (!cancelled) setClipWindowMs(Math.max(1000, ms));
        return;
      }
      if (video?.file) {
        try {
          const durationSec = await probeVideoDuration(video.file);
          if (!cancelled) {
            setClipWindowMs(Math.max(1000, Math.round(durationSec * 1000)));
          }
          return;
        } catch {
          // fall through to mode defaults
        }
      }
      if (!cancelled) {
        setClipWindowMs(mode === 'STORY' ? 5000 : 15_000);
      }
    };

    void resolveClipWindow();
    return () => {
      cancelled = true;
    };
  }, [mediaFiles, mode]);

  const handleManageCloseFriends = () => {
    setSubScreen('close_friends');
  };

  const prevStepRef = React.useRef(step);
  React.useEffect(() => {
    const prevIdx = STEP_ORDER.indexOf(prevStepRef.current);
    const currIdx = STEP_ORDER.indexOf(step);
    setStepDirection(currIdx >= prevIdx ? 1 : -1);
    prevStepRef.current = step;
  }, [step]);

  React.useEffect(() => {
    if (
      isStoryMode &&
      step === 'edit' &&
      mediaFiles.length > 0 &&
      !isComposed
    ) {
      // A photo or a video: both open in the story editor.
      setShowStoryComposer(true);
    }
  }, [isStoryMode, step, mediaFiles, isComposed]);

  React.useEffect(() => {
    if (step === 'upload') setIsComposed(false);
  }, [step, setIsComposed]);

  const headerTitle =
    mode === 'STORY'
      ? t('createPost.header.add_to_story')
      : mode === 'FRAME'
        ? t('createPost.header.new_frame')
        : t('createPost.header.new_post');

  const documentTitle =
    mode === 'STORY'
      ? t('createPost.seo.story')
      : mode === 'FRAME'
        ? t('createPost.seo.frame')
        : t('createPost.seo.post');

  const nextLabel = (() => {
    if (step === 'caption' || (isStoryMode && step === 'edit')) {
      return isPending ? null : t('createPost.header.share');
    }
    return t('createPost.header.next');
  })();

  const handleNext = () => {
    if (step === 'upload') {
      galleryNext?.();
    } else if (step === 'edit') {
      if (isStoryMode) handleSubmit();
      else setStep('caption');
    } else if (step === 'caption') {
      handleSubmit();
    }
  };

  const editorOverlay = (
    <EditorOverlayManager
      showStoryComposer={showStoryComposer}
      setShowStoryComposer={setShowStoryComposer}
      initialEditorTab={editorTab}
    />
  );

  if (isStarting)
    return (
      <div
        className={`${CREATE_FULL_SCREEN} flex items-center justify-center text-white font-medium`}
      >
        <SEO title={documentTitle} noIndex />
        <BrandAmbientBackground placement="editor" />
        {t('createPost.edit.loading_story_editor')}
      </div>
    );

  if (showFrameTrim || showStoryComposer || currentEditIndex !== null)
    return (
      <ComposerProvider value={composer}>
        <SEO title={documentTitle} noIndex />
        {editorOverlay}
        {/* Music, place and close friends open over the story editor, which
            stays as it is underneath. */}
        {showStoryComposer && subScreen !== 'none' ? (
          <div className="beside-sidebar fixed inset-0 z-60 flex items-center justify-center bg-black/80">
            <ComposerChrome size="fit">
              <SubScreenRouter clipWindowMs={clipWindowMs} />
            </ComposerChrome>
          </div>
        ) : null}
      </ComposerProvider>
    );

  if (subScreen !== 'none') {
    return (
      <ComposerProvider value={composer}>
        <SEO title={documentTitle} noIndex />
        <ComposerChrome size="fit">
          <SubScreenRouter clipWindowMs={clipWindowMs} />
        </ComposerChrome>
      </ComposerProvider>
    );
  }

  if (step === 'upload' && !showPicker && !galleryFirst) {
    return (
      <ComposerProvider value={composer}>
        <SEO title={documentTitle} noIndex />
        <StoryCapture
          mode={liveMode ? 'LIVE' : mode}
          onModeChange={(next) => {
            setLiveMode(next === 'LIVE');
            if (next !== 'LIVE' && next !== mode) {
              navigate(`/create?mode=${next.toLowerCase()}`, { replace: true });
            }
          }}
          onGoLive={() => navigate('/live/broadcast')}
          onNoCamera={() => {
            setPickerIsStart(true);
            setShowPicker(true);
          }}
          onCapture={(file) =>
            handleFileSelect({
              target: { files: [file] as unknown as FileList },
            } as Pick<React.ChangeEvent<HTMLInputElement>, 'target'>)
          }
          onOpenGallery={() => {
            // A post or a Frame picks on the upload step, with its own
            // gallery and its limits; a story on the device's gallery.
            if (!isStoryMode || hasDeviceGallery()) setShowPicker(true);
            else fileInputRef.current?.click();
          }}
          onCreate={() => setShowStoryComposer(true)}
          onClose={reset}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </ComposerProvider>
    );
  }

  return (
    <ComposerProvider value={composer}>
      <SEO title={documentTitle} noIndex />
      <ComposerChrome
        size={step === 'caption' ? 'wide' : 'default'}
        data-testid="content-composer"
        data-create-mode={mode}
      >
        <Header
          onBack={() => {
            // Composed story: back reopens the immersive editor (don't wipe to upload)
            if (isStoryMode && step === 'edit' && isComposed) {
              setShowStoryComposer(true);
              return;
            }
            // From the gallery, back to the camera, unless the gallery
            // opened by itself because there is no camera.
            if (
              step === 'upload' &&
              showPicker &&
              !pickerIsStart &&
              !galleryFirst
            ) {
              setShowPicker(false);
              return;
            }
            reset();
          }}
          onNext={handleNext}
          title={headerTitle}
          nextLabel={nextLabel}
          isPending={isPending}
          canNext={
            step === 'upload'
              ? galleryNext !== null
              : mediaFiles.length > 0 &&
                !(step === 'caption' && caption.length > 2200)
          }
        />

        <AnimatePresence>
          {isStoryMode && step === 'edit' && (
            <StoryControlsBar
              onOpenMusic={() => setSubScreen('music')}
              selectedAudio={selectedAudio}
              location={location}
              onOpenLocation={() => setSubScreen('location')}
              isCloseFriendsOnly={isCloseFriendsOnly}
              setIsCloseFriendsOnly={setIsCloseFriendsOnly}
              closeFriendsCount={closeFriendsCount}
              onManageCloseFriends={handleManageCloseFriends}
            />
          )}
        </AnimatePresence>

        <div
          className={`flex-1 flex flex-col min-h-0 relative ${
            step === 'edit' ? 'overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          <AnimatePresence custom={stepDirection} mode="wait">
            {step === 'upload' && (
              <StepAnimationWrapper
                direction={stepDirection}
                stepKey="upload_step"
              >
                <UploadStep
                  fileInputRef={fileInputRef}
                  handleFileSelect={handleFileSelect}
                  mode={mode}
                  setMode={setMode}
                  allowModeSwitch={!modeLockedFromEntry}
                  onTextStory={() => setShowStoryComposer(true)}
                  onContinueChange={onGalleryNextChange}
                />
              </StepAnimationWrapper>
            )}

            {step === 'edit' && (
              <StepAnimationWrapper
                direction={stepDirection}
                stepKey="edit_step"
              >
                <EditStep
                  mediaFiles={mediaFiles}
                  mode={mode}
                  setMode={setMode}
                  setCurrentEditIndex={setCurrentEditIndex}
                  onChooseEditorTab={setEditorTab}
                  onEditMedia={
                    isStoryMode && isComposed
                      ? () => setShowStoryComposer(true)
                      : undefined
                  }
                  handleRemoveFile={handleRemoveFile}
                  onMoveFile={handleMoveFile}
                  onApplyFilter={handleQuickFilter}
                  fileInputRef={fileInputRef}
                  allowModeSwitch={!modeLockedFromEntry}
                  postShape={postShape}
                  onPostShapeChange={setPostShape}
                />
              </StepAnimationWrapper>
            )}

            {step === 'caption' && (
              <StepAnimationWrapper
                direction={stepDirection}
                stepKey="caption_step"
              >
                <CaptionStep
                  mediaFiles={mediaFiles}
                  mode={mode}
                  caption={caption}
                  setCaption={setCaption}
                  location={location}
                  setSubScreen={setSubScreen}
                  selectedAudio={selectedAudio}
                  onClearAudio={() => {
                    setSelectedAudio(null);
                    setAudioStartMs(0);
                  }}
                  onOpenMusic={() => setSubScreen('music')}
                  isPremium={isPremium}
                  interactiveDraft={interactiveDraft}
                  hasChosenCover={coverTimeMs !== null}
                  // Not for a paid post, which is never shared, nor for one
                  // not out yet, which has nothing to share until it is.
                  shareToStory={
                    mode === 'POST' && !isPremium && !composer.scheduledAt
                      ? {
                          on: composer.shareToStory,
                          onChange: composer.setShareToStory,
                        }
                      : undefined
                  }
                  postShape={postShape}
                />
              </StepAnimationWrapper>
            )}
          </AnimatePresence>
        </div>
      </ComposerChrome>

      <ConfirmModal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={confirmDiscard}
        title={t('createPost.discard.title')}
        message={t('createPost.discard.message')}
        confirmText={t('createPost.discard.confirm')}
        cancelText={t('createPost.discard.cancel')}
      />
    </ComposerProvider>
  );
}
