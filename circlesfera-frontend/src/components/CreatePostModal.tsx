import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCreatePost } from '../hooks/useCreatePost';
import CaptionStep from './create-post/CaptionStep';
import EditorOverlayManager from './create-post/EditorOverlayManager';
import EditStep from './create-post/EditStep';
// Refactored Parts
import Header from './create-post/Header';
import StepAnimationWrapper from './create-post/StepAnimationWrapper.tsx';
import StoryControlsBar from './create-post/StoryControlsBar';
import SubScreenRouter from './create-post/SubScreenRouter';
import UploadStep from './create-post/UploadStep';
// Components
import MusicPicker from './MusicPicker';

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
    caption,
    setCaption,
    location,
    setLocation,
    hideLikes,
    setHideLikes,
    turnOffComments,
    setTurnOffComments,
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
    isPending,
    isProcessingEdit,
  } = useCreatePost();

  const isStoryMode = mode === 'STORY';

  // Track step direction for animations
  const prevStepRef = React.useRef(step);
  React.useEffect(() => {
    const prevIdx = STEP_ORDER.indexOf(prevStepRef.current);
    const currIdx = STEP_ORDER.indexOf(step);
    setStepDirection(currIdx >= prevIdx ? 1 : -1);
    prevStepRef.current = step;
  }, [step]);

  // Auto-open composer for new story images
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

  // Reset composed state when restarting
  React.useEffect(() => {
    if (step === 'upload') setIsComposed(false);
  }, [step, setIsComposed]);

  // --- Computed Header Props ---
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

  // --- Overlays (Early returns for full-screen editors or specialized screens) ---

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
        setLocation={setLocation}
        location={location}
        onGenerateAltText={generateAltTextForIndex}
        tagsMap={tagsMap}
        setTagsMap={setTagsMap}
        isPremium={isPremium}
        setIsPremium={setIsPremium}
        price={price}
        setPrice={setPrice}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-4 animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <motion.div
        layout
        className={`
          bg-neutral-900/95 backdrop-blur-2xl border border-white/6 w-full
          ${step === 'caption' ? 'max-w-4xl h-[78vh]' : 'max-w-md md:max-w-2xl max-h-[90vh] md:max-h-[85vh] h-full'}
          rounded-xl overflow-hidden shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8)]
          flex flex-col relative
        `}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <Header
          onBack={reset}
          onNext={handleNext}
          title={headerTitle}
          nextLabel={nextLabel}
          isPending={isPending}
          canNext={mediaFiles.length > 0}
          step={step}
          mode={mode}
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

        {/* Content — Animated Step Transitions */}
        <div
          className={`flex-1 flex flex-col min-h-[300px] relative ${
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
                />
              </StepAnimationWrapper>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Music Picker Overlay */}
      {showMusicPicker && (
        <MusicPicker
          onSelect={(audio) => {
            setSelectedAudio(audio);
            setShowMusicPicker(false);
          }}
          onClose={() => setShowMusicPicker(false)}
        />
      )}
    </div>
  );
}
