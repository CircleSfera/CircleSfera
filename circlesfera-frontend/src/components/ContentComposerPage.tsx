import { AnimatePresence } from 'framer-motion';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { probeVideoDuration } from '../constants/uploadLimits';
import { useCloseFriendsList } from '../hooks/useCloseFriendsList';
import { useCreatePost } from '../hooks/useCreatePost';
import SEO from './common/SEO';
import CaptionStep from './create-post/CaptionStep';
import ComposerChrome from './create-post/ComposerChrome';
import EditorOverlayManager from './create-post/EditorOverlayManager';
import EditStep from './create-post/EditStep';
import Header from './create-post/Header';
import StepAnimationWrapper from './create-post/StepAnimationWrapper.tsx';
import StoryControlsBar from './create-post/StoryControlsBar';
import SubScreenRouter from './create-post/SubScreenRouter';
import UploadStep from './create-post/UploadStep';
import ConfirmModal from './modals/ConfirmModal';

const STEP_ORDER = ['upload', 'edit', 'caption'] as const;

export default function ContentComposerPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  // Explicit entry from CreateBottomSheet locks mode switcher (ADR-0018)
  const modeLockedFromEntry =
    modeParam === 'post' ||
    modeParam === 'story' ||
    modeParam === 'frame' ||
    modeParam === 'circle';

  const [stepDirection, setStepDirection] = React.useState(1);
  const [showStoryComposer, setShowStoryComposer] = React.useState(false);
  const [clipWindowMs, setClipWindowMs] = React.useState(15_000);

  const {
    mode,
    setMode,
    step,
    setStep,
    subScreen,
    setSubScreen,
    mediaFiles,
    setMediaFiles,
    currentEditIndex,
    setCurrentEditIndex,
    showFrameTrim,
    frameSourceDurationSec,
    handleFrameTrimConfirm,
    handleFrameTrimCancel,
    showDiscardConfirm,
    setShowDiscardConfirm,
    confirmDiscard,
    caption,
    setCaption,
    location,
    setLocation,
    setSelectedPlace,
    hideLikes,
    setHideLikes,
    turnOffComments,
    setTurnOffComments,
    isSensitive,
    setIsSensitive,
    selectedAudio,
    setSelectedAudio,
    audioStartMs,
    setAudioStartMs,
    isCloseFriendsOnly,
    setIsCloseFriendsOnly,
    altTextMap,
    setAltTextMap,
    tagsMap,
    setTagsMap,
    fileInputRef,
    handleFileSelect,
    handleFilterSave,
    handleRemoveFile,
    handleSubmit,
    reset,
    generateAltTextForIndex,
    storyElements,
    setStoryElements,
    storyBgStyle,
    setStoryBgStyle,
    isComposed,
    setIsComposed,
    originalStoryMedia,
    setOriginalStoryMedia,
    isPremium,
    setIsPremium,
    price,
    setPrice,
    scheduledAt,
    setScheduledAt,
    interactiveDraft,
    setInteractiveDraft,
    isPending,
    isProcessingEdit,
  } = useCreatePost();

  const isStoryMode = mode === 'STORY';

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
      !isComposed &&
      mediaFiles[0].type === 'image'
    ) {
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
    if (step === 'edit') {
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
      currentEditIndex={currentEditIndex}
      setCurrentEditIndex={setCurrentEditIndex}
      showFrameTrim={showFrameTrim}
      frameSourceDurationSec={frameSourceDurationSec}
      onFrameTrimConfirm={handleFrameTrimConfirm}
      onFrameTrimCancel={handleFrameTrimCancel}
      mediaFiles={mediaFiles}
      setMediaFiles={setMediaFiles}
      setIsComposed={setIsComposed}
      setStep={setStep}
      originalStoryMedia={originalStoryMedia}
      setOriginalStoryMedia={setOriginalStoryMedia}
      storyElements={storyElements}
      storyBgStyle={storyBgStyle}
      setStoryElements={setStoryElements}
      setStoryBgStyle={setStoryBgStyle}
      handleFilterSave={handleFilterSave}
      isProcessingEdit={isProcessingEdit}
      constrainFrameDuration={mode === 'FRAME'}
    />
  );

  if (showFrameTrim || showStoryComposer || currentEditIndex !== null)
    return (
      <>
        <SEO title={documentTitle} noIndex />
        {editorOverlay}
      </>
    );

  if (subScreen !== 'none') {
    return (
      <>
        <SEO title={documentTitle} noIndex />
        <ComposerChrome size="fit">
          <SubScreenRouter
            subScreen={subScreen}
            setSubScreen={setSubScreen}
            mediaFiles={mediaFiles}
            altTextMap={altTextMap}
            setAltTextMap={setAltTextMap}
            handleRemoveFile={handleRemoveFile}
            hideLikes={hideLikes}
            setHideLikes={setHideLikes}
            turnOffComments={turnOffComments}
            setTurnOffComments={setTurnOffComments}
            isSensitive={isSensitive}
            setIsSensitive={setIsSensitive}
            showSensitiveToggle={mode !== 'STORY'}
            setLocation={setLocation}
            location={location}
            setSelectedPlace={setSelectedPlace}
            onGenerateAltText={generateAltTextForIndex}
            tagsMap={tagsMap}
            setTagsMap={setTagsMap}
            isPremium={isPremium}
            setIsPremium={setIsPremium}
            price={price}
            setPrice={setPrice}
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            interactiveDraft={interactiveDraft}
            setInteractiveDraft={setInteractiveDraft}
            selectedAudio={selectedAudio}
            setSelectedAudio={(selection) => {
              if (!selection) {
                setSelectedAudio(null);
                setAudioStartMs(0);
                return;
              }
              setSelectedAudio(selection.audio);
              setAudioStartMs(selection.audioStartMs);
            }}
            audioStartMs={audioStartMs}
            clipWindowMs={clipWindowMs}
          />
        </ComposerChrome>
      </>
    );
  }

  return (
    <>
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
            reset();
          }}
          onNext={handleNext}
          title={headerTitle}
          nextLabel={nextLabel}
          isPending={isPending}
          canNext={
            mediaFiles.length > 0 &&
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
                  onEditMedia={
                    isStoryMode && isComposed
                      ? () => setShowStoryComposer(true)
                      : undefined
                  }
                  handleRemoveFile={handleRemoveFile}
                  fileInputRef={fileInputRef}
                  allowModeSwitch={!modeLockedFromEntry}
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
    </>
  );
}
