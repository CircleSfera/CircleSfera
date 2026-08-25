import { AnimatePresence } from 'framer-motion';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCreatePost } from '../hooks/useCreatePost';
import CaptionStep from './create-post/CaptionStep';
import EditorOverlayManager from './create-post/EditorOverlayManager';
import EditStep from './create-post/EditStep';
import Header from './create-post/Header';
import StepAnimationWrapper from './create-post/StepAnimationWrapper.tsx';
import StoryControlsBar from './create-post/StoryControlsBar';
import SubScreenRouter from './create-post/SubScreenRouter';
import UploadStep from './create-post/UploadStep';
import MusicPicker from './MusicPicker';
import ConfirmModal from './modals/ConfirmModal';

const STEP_ORDER = ['upload', 'edit', 'caption'] as const;

export default function CreatePostModal() {
  const { t } = useTranslation();
  const [showMusicPicker, setShowMusicPicker] = React.useState(false);
  const [stepDirection, setStepDirection] = React.useState(1);
  const [showStoryComposer, setShowStoryComposer] = React.useState(false);

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
    showDiscardConfirm,
    setShowDiscardConfirm,
    confirmDiscard,
    caption,
    setCaption,
    location,
    setLocation,
    hideLikes,
    setHideLikes,
    turnOffComments,
    setTurnOffComments,
    isSensitive,
    setIsSensitive,
    selectedAudio,
    setSelectedAudio,
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
    />
  );

  if (showStoryComposer || currentEditIndex !== null) return editorOverlay;

  if (subScreen !== 'none') {
    return (
      <div className="relative h-dvh w-full bg-surface-base pt-safe pb-safe overflow-hidden">
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
        />
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full bg-surface-base pt-safe pb-safe flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 w-full bg-surface-elevated md:border-x md:border-white/6 overflow-hidden">
        <Header
          onBack={reset}
          onNext={handleNext}
          title={headerTitle}
          nextLabel={nextLabel}
          isPending={isPending}
          canNext={mediaFiles.length > 0}
        />

        <AnimatePresence>
          {isStoryMode && step === 'edit' && (
            <StoryControlsBar
              setShowMusicPicker={setShowMusicPicker}
              selectedAudio={selectedAudio}
              isCloseFriendsOnly={isCloseFriendsOnly}
              setIsCloseFriendsOnly={setIsCloseFriendsOnly}
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
                  handleRemoveFile={handleRemoveFile}
                  fileInputRef={fileInputRef}
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
                  setSelectedAudio={setSelectedAudio}
                  setShowMusicPicker={setShowMusicPicker}
                  isPremium={isPremium}
                  interactiveDraft={interactiveDraft}
                />
              </StepAnimationWrapper>
            )}
          </AnimatePresence>
        </div>
      </div>

      {showMusicPicker && (
        <MusicPicker
          onSelect={(audio) => {
            setSelectedAudio(audio);
            setShowMusicPicker(false);
          }}
          onClose={() => setShowMusicPicker(false)}
        />
      )}

      <ConfirmModal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={confirmDiscard}
        title={t('createPost.discard.title', '¿Descartar publicación?')}
        message={t(
          'createPost.discard.message',
          'Si sales ahora, perderás todos los cambios.',
        )}
        confirmText={t('createPost.discard.confirm', 'Descartar')}
        cancelText={t('createPost.discard.cancel', 'Cancelar')}
      />
    </div>
  );
}
