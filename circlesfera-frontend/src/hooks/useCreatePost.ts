import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FRAME_MAX_DURATION_SEC,
  probeVideoDuration,
} from '../constants/uploadLimits';
import { defaultFrameWindow } from '../utils/frameClip';
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
    import('../stores/uiStore').then(async ({ useUIStore }) => {
      const uiState = useUIStore.getState();
      if (uiState.editedMediaForPost) {
        const handoff = uiState.editedMediaForPost;
        uiState.setEditedMediaForPost(null);
        const file = handoff.file;
        const newFile: MediaFile = {
          file,
          url: URL.createObjectURL(file),
          type: file.type.startsWith('video') ? 'video' : 'image',
        };
        if (handoff.scheduledAt) {
          state.setScheduledAt(handoff.scheduledAt);
        }
        // A video from the Studio carries its length, as one chosen from the
        // gallery does, so sharing it as a Frame can check it and the trim
        // screen knows how long it is. One longer than a Frame opens the trim.
        let sourceSec = 0;
        if (newFile.type === 'video') {
          sourceSec = await probeVideoDuration(file).catch(() => 0);
        }
        if (sourceSec > 0) {
          const clip = defaultFrameWindow(sourceSec);
          newFile.videoData = { ...clip, muted: false };
          state.setFrameSourceDurationSec(sourceSec);
        }
        media.setMediaFiles([newFile]);
        if (sourceSec > FRAME_MAX_DURATION_SEC) {
          state.setShowFrameTrim(true);
          state.setStep('edit');
        } else {
          state.setStep('caption');
        }
      }
    });
  }, [
    media.setMediaFiles,
    state.setScheduledAt,
    state.setStep,
    state.setFrameSourceDurationSec,
    state.setShowFrameTrim,
  ]);

  const mutation = useCreatePostMutation({
    mode: state.mode,
    postShape: state.postShape,
    caption: state.caption,
    hideLikes: state.hideLikes,
    turnOffComments: state.turnOffComments,
    coverTimeMs: state.coverTimeMs,
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
    storyCanvasSize: state.storyCanvasSize,
    storyOverlay: state.storyOverlay,
    mediaFiles: media.mediaFiles,
    altTextMap: media.altTextMap,
    tagsMap: media.tagsMap,
    isProcessingEdit: media.isProcessingEdit,
    setIsProcessingEdit: media.setIsProcessingEdit,
    uploadFiles: media.uploadFiles,
    setShowFrameTrim: state.setShowFrameTrim,
  });

  // A Frame the server put together from its clips goes straight to its
  // caption, whole: it already lasts what a Frame may.
  const takeAssembledFrame = (frame: {
    file: File;
    url: string;
    durationSec: number;
  }) => {
    media.setMediaFiles([
      {
        file: frame.file,
        url: URL.createObjectURL(frame.file),
        type: 'video',
        remoteUrl: frame.url,
        assembledFrame: true,
        videoData: { startTime: 0, endTime: frame.durationSec, muted: false },
      },
    ]);
    state.setFrameSourceDurationSec(frame.durationSec);
    state.setStep('caption');
  };

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

  // Closing the story editor lets the photo or video go, with what was added
  // to it (its song and place too), and goes back to the camera, as a new
  // story starts.
  const discardStory = () => {
    media.setMediaFiles([]);
    state.setSelectedAudio(null);
    state.setAudioStartMs(0);
    state.setLocation('');
    state.setSelectedPlace(null);
    state.setOriginalStoryMedia(null);
    state.setStoryElements([]);
    state.setStoryBgStyle('');
    state.setStoryOverlay(null);
    state.setIsComposed(false);
    state.setStep('upload');
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
    discardStory,
    confirmDiscard,
    takeAssembledFrame,
    isPending:
      mutation.isPending || media.isUploading || media.isProcessingEdit,
  };
}
