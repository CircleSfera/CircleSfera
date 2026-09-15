import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePostMedia } from './useCreatePostMedia';
import { useCreatePostMutation } from './useCreatePostMutation';
import { type MediaFile, useCreatePostState } from './useCreatePostState';

export type {
  CreateMode,
  InteractiveDraft,
  MediaFile,
  PostTagData,
  Step,
  SubScreen,
} from './useCreatePostState';

export function useCreatePost() {
  const navigate = useNavigate();
  const state = useCreatePostState();

  const media = useCreatePostMedia({
    mode: state.mode,
    setStep: state.setStep,
    setShowFrameTrim: state.setShowFrameTrim,
    setFrameSourceDurationSec: state.setFrameSourceDurationSec,
    setOriginalStoryMedia: state.setOriginalStoryMedia,
  });

  // Read seamless transfer state from UI Store (Legacy compatibility)
  useEffect(() => {
    import('../stores/uiStore').then(({ useUIStore }) => {
      const uiState = useUIStore.getState();
      if (uiState.editedMediaForPost) {
        const handoff = uiState.editedMediaForPost;
        const file = handoff.file;
        const newFile: MediaFile = {
          file,
          url: URL.createObjectURL(file),
          type: file.type.startsWith('video') ? 'video' : 'image',
        };
        media.setMediaFiles([newFile]);
        if (handoff.scheduledAt) {
          state.setScheduledAt(handoff.scheduledAt);
        }
        state.setStep('caption');
        uiState.setEditedMediaForPost(null);
      }
    });
  }, [media.setMediaFiles, state.setScheduledAt, state.setStep]);

  const mutation = useCreatePostMutation({
    mode: state.mode,
    caption: state.caption,
    hideLikes: state.hideLikes,
    turnOffComments: state.turnOffComments,
    isSensitive: state.isSensitive,
    location: state.location,
    selectedPlace: state.selectedPlace,
    selectedAudio: state.selectedAudio,
    audioStartMs: state.audioStartMs,
    isCloseFriendsOnly: state.isCloseFriendsOnly,
    isPremium: state.isPremium,
    price: state.price,
    scheduledAt: state.scheduledAt,
    interactiveDraft: state.interactiveDraft,
    storyElements: state.storyElements,
    mediaFiles: media.mediaFiles,
    altTextMap: media.altTextMap,
    tagsMap: media.tagsMap,
    isProcessingEdit: media.isProcessingEdit,
    setIsProcessingEdit: media.setIsProcessingEdit,
    uploadFiles: media.uploadFiles,
    setShowFrameTrim: state.setShowFrameTrim,
  });

  const reset = () => {
    if (state.step === 'edit') {
      if (state.mode === 'STORY' && state.isComposed) {
        state.setStep('upload');
        state.setIsComposed(false);
      } else {
        state.setStep('upload');
      }
    } else if (state.step === 'caption') {
      state.setStep('edit');
    } else {
      if (media.mediaFiles.length > 0 || state.caption.length > 0) {
        state.setShowDiscardConfirm(true);
      } else {
        navigate(-1);
      }
    }
  };

  const confirmDiscard = () => {
    state.setShowDiscardConfirm(false);
    navigate(-1);
  };

  // We need to return the exact same interface as the old hook
  return {
    ...state,
    ...media,
    handleSubmit: mutation.handleSubmit,
    reset,
    confirmDiscard,
    isPending:
      mutation.isPending || media.isUploading || media.isProcessingEdit,
  };
}
