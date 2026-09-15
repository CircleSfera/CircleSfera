import { lazy, Suspense } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
} from '../../constants/uploadLimits';
import type { MediaFile } from '../../hooks/useCreatePost';
import type { StoryElement } from '../../types';
import type { CropData, VideoData } from '../PhotoEditor';
import FrameTrimOverlay from './FrameTrimOverlay';

const PhotoEditor = lazy(() => import('../PhotoEditor'));
const StoryComposer = lazy(() => import('../story/StoryComposer'));

interface EditorOverlayManagerProps {
  showStoryComposer: boolean;
  setShowStoryComposer: (val: boolean) => void;
  currentEditIndex: number | null;
  setCurrentEditIndex: (val: number | null) => void;
  showFrameTrim?: boolean;
  frameSourceDurationSec?: number;
  onFrameTrimConfirm?: (videoData: VideoData) => void;
  onFrameTrimCancel?: () => void;
  mediaFiles: MediaFile[];
  setMediaFiles: (files: MediaFile[]) => void;
  setIsComposed: (val: boolean) => void;
  setStep: (step: 'edit' | 'caption') => void;
  originalStoryMedia: {
    file: File;
    url: string;
    type: 'image' | 'video';
  } | null;
  setOriginalStoryMedia: (
    media: { file: File; url: string; type: 'image' | 'video' } | null,
  ) => void;
  storyElements: StoryElement[];
  storyBgStyle: string;
  setStoryElements: (elements: StoryElement[]) => void;
  setStoryBgStyle: (style: string) => void;
  handleFilterSave: (
    file: File,
    filterString: string,
    cropData?: CropData,
    overlayDataUrl?: string,
    videoData?: VideoData,
  ) => void;
  isProcessingEdit?: boolean;
  /** When true, PhotoEditor constrains trim to Frame 15–90s window. */
  constrainFrameDuration?: boolean;
}

export default function EditorOverlayManager({
  showStoryComposer,
  setShowStoryComposer,
  currentEditIndex,
  setCurrentEditIndex,
  showFrameTrim = false,
  frameSourceDurationSec = 0,
  onFrameTrimConfirm,
  onFrameTrimCancel,
  mediaFiles,
  setMediaFiles,
  setIsComposed,
  setStep,
  originalStoryMedia,
  setOriginalStoryMedia,
  storyElements,
  storyBgStyle,
  setStoryElements,
  setStoryBgStyle,
  handleFilterSave,
  isProcessingEdit,
  constrainFrameDuration = false,
}: EditorOverlayManagerProps) {
  const { t } = useTranslation();

  if (
    showFrameTrim &&
    mediaFiles[0]?.type === 'video' &&
    onFrameTrimConfirm &&
    onFrameTrimCancel
  ) {
    const clip = mediaFiles[0];
    const initialWindow = clip.videoData
      ? {
          startTime: clip.videoData.startTime,
          endTime: clip.videoData.endTime,
        }
      : { startTime: 0, endTime: Math.min(90, frameSourceDurationSec) };
    return (
      <FrameTrimOverlay
        file={clip.file}
        url={clip.url}
        sourceDurationSec={frameSourceDurationSec}
        initialWindow={initialWindow}
        muted={clip.videoData?.muted}
        onConfirm={onFrameTrimConfirm}
        onCancel={onFrameTrimCancel}
      />
    );
  }

  const handleComposerSave = async (blob: Blob) => {
    const file = new File([blob], 'story_composed.png', { type: 'image/png' });
    const url = URL.createObjectURL(file);
    setMediaFiles([{ file, url, type: 'image' }]);
    setIsComposed(true);
    setShowStoryComposer(false);
    setStep('edit');
  };

  if (showStoryComposer) {
    return (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-50 bg-black flex items-center justify-center text-white font-medium">
            {t('createPost.edit.loading_story_editor')}
          </div>
        }
      >
        <StoryComposer
          initialMedia={originalStoryMedia?.file}
          onClose={() => {
            setShowStoryComposer(false);
            if (mediaFiles.length > 0) setIsComposed(true);
          }}
          onPost={handleComposerSave}
          elements={storyElements}
          bgStyle={storyBgStyle}
          onElementsChange={setStoryElements}
          onBgStyleChange={setStoryBgStyle}
          onBackgroundChange={(file) =>
            setOriginalStoryMedia({
              file,
              url: URL.createObjectURL(file),
              type: file.type.startsWith('video') ? 'video' : 'image',
            })
          }
        />
      </Suspense>
    );
  }

  if (currentEditIndex !== null) {
    return (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-50 bg-black flex items-center justify-center text-white font-medium">
            {t('createPost.edit.loading_media_editor')}
          </div>
        }
      >
        <div className="fixed inset-0 z-50 bg-black">
          {isProcessingEdit && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="text-white font-bold animate-pulse">
                {t('createPost.edit.processing_media')}
              </div>
            </div>
          )}
          <PhotoEditor
            image={mediaFiles[currentEditIndex].file}
            onSave={handleFilterSave}
            onCancel={() => setCurrentEditIndex(null)}
            initialState={{
              videoData: mediaFiles[currentEditIndex].videoData,
              filter: mediaFiles[currentEditIndex].filter,
            }}
            initialTab={
              constrainFrameDuration &&
              mediaFiles[currentEditIndex].type === 'video'
                ? 'TRIM'
                : undefined
            }
            constrainDuration={
              constrainFrameDuration
                ? {
                    min: FRAME_MIN_DURATION_SEC,
                    max: FRAME_MAX_DURATION_SEC,
                  }
                : undefined
            }
            onApplyToAll={
              mediaFiles.length > 1
                ? (filterString) => {
                    setMediaFiles(
                      mediaFiles.map((m, idx) => {
                        if (idx === currentEditIndex) return m;
                        return { ...m, filter: filterString };
                      }),
                    );
                    toast.success(t('createPost.edit.filters_applied_all'));
                  }
                : undefined
            }
          />
        </div>
      </Suspense>
    );
  }

  return null;
}
