import { lazy, Suspense, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
} from '../../constants/uploadLimits';
import { useCloseFriendsList } from '../../hooks/useCloseFriendsList';
import { parseFilter } from '../../utils/styleUtils';
import BrandAmbientBackground from '../common/BrandAmbientBackground';
import type { PhotoEditorTab } from '../photo-editor/photoEditor.types';
import { hasPaint, type StoryCanvasSize } from '../story/storyComposer.export';
import type { StoryAudience } from '../story/storyShare.types';
import { useComposer } from './ComposerContext';
import { CREATE_FULL_SCREEN, createThumbRatio } from './createStyles';
import FrameTrimOverlay from './FrameTrimOverlay';

const PhotoEditor = lazy(() => import('../PhotoEditor'));
const StoryComposer = lazy(() => import('../story/StoryComposer'));
interface EditorOverlayManagerProps {
  showStoryComposer: boolean;
  setShowStoryComposer: (val: boolean) => void;
  /** The tab the photo editor opens on; filters when not given. */
  initialEditorTab?: PhotoEditorTab;
}

export default function EditorOverlayManager({
  showStoryComposer,
  setShowStoryComposer,
  initialEditorTab,
}: EditorOverlayManagerProps) {
  const {
    mode,
    currentEditIndex,
    setCurrentEditIndex,
    showFrameTrim,
    frameSourceDurationSec,
    handleFrameTrimConfirm,
    handleFrameTrimCancel,
    mediaFiles,
    setMediaFiles,
    setIsComposed,
    setStep,
    setStoryOverlay,
    originalStoryMedia,
    setOriginalStoryMedia,
    storyElements,
    storyBgStyle,
    setStoryElements,
    setStoryCanvasSize,
    setStoryBgStyle,
    handleFilterSave,
    isProcessingEdit,
    setIsCloseFriendsOnly,
    setSubScreen,
    selectedAudio,
    location,
    selectedPlace,
    handleSubmit,
    isPending,
  } = useComposer();
  const { closeFriendsCount } = useCloseFriendsList(mode === 'STORY');
  // The composed picture of a story shared from its editor, until it is the
  // media of the composer and can be sent.
  const [pendingShare, setPendingShare] = useState<File | null>(null);

  useEffect(() => {
    if (pendingShare && mediaFiles[0]?.file === pendingShare) {
      setPendingShare(null);
      handleSubmit();
    }
  }, [pendingShare, mediaFiles, handleSubmit]);
  // The trim of a frame keeps to the length a frame may have.
  const constrainFrameDuration = mode === 'FRAME';
  const { t } = useTranslation();

  if (showFrameTrim && mediaFiles[0]?.type === 'video') {
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
        onConfirm={handleFrameTrimConfirm}
        onCancel={handleFrameTrimCancel}
      />
    );
  }

  const handleComposerSave = async (
    blob: Blob,
    canvas: StoryCanvasSize,
    audience?: StoryAudience,
    video?: File | null,
  ) => {
    setStoryCanvasSize(canvas);
    let file: File;
    if (video) {
      // A video story stays a video; what is painted over it goes as a layer,
      // and only when something is.
      const layer = new File([blob], 'story_layer.png', { type: 'image/png' });
      setStoryOverlay(
        (await hasPaint(blob).catch(() => true)) ? { video, layer } : null,
      );
      file = video;
      if (mediaFiles[0]?.file !== video) {
        setMediaFiles([
          { file: video, url: URL.createObjectURL(video), type: 'video' },
        ]);
      }
    } else {
      setStoryOverlay(null);
      file = new File([blob], 'story_composed.png', { type: 'image/png' });
      setMediaFiles([{ file, url: URL.createObjectURL(file), type: 'image' }]);
    }
    setIsComposed(true);
    if (audience) {
      // Shared from the editor: it stays open, busy, until the story is up.
      setIsCloseFriendsOnly(audience === 'close_friends');
      setPendingShare(file);
      return;
    }
    setShowStoryComposer(false);
    setStep('edit');
  };

  if (showStoryComposer) {
    return (
      <Suspense
        fallback={
          <div
            className={`${CREATE_FULL_SCREEN} flex items-center justify-center text-white font-medium`}
          >
            <BrandAmbientBackground placement="editor" />
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
          share={{
            closeFriendsCount,
            onManageCloseFriends: () => setSubScreen('close_friends'),
            isSharing: isPending || pendingShare !== null,
            musicTitle: selectedAudio?.title ?? null,
            onOpenMusic: () => setSubScreen('music'),
            placeName: location || null,
            placeStickerName: selectedPlace?.name ?? null,
            onOpenPlace: () => setSubScreen('location'),
          }}
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
          <div
            className={`${CREATE_FULL_SCREEN} flex items-center justify-center text-white font-medium`}
          >
            <BrandAmbientBackground placement="editor" />
            {t('createPost.edit.loading_media_editor')}
          </div>
        }
      >
        <div className={CREATE_FULL_SCREEN}>
          <BrandAmbientBackground placement="editor" />
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
            thumbnailRatio={createThumbRatio(mode)}
            // Opens where it was left. The clip of a video can also change on
            // the trim screen, so its window comes from the item itself.
            initialState={{
              filter: parseFilter(mediaFiles[currentEditIndex].filter)
                .className,
              ...mediaFiles[currentEditIndex].editorState,
              videoData: mediaFiles[currentEditIndex].videoData,
            }}
            // The tab asked for; a frame video opened without one starts on
            // its trim.
            initialTab={
              initialEditorTab ??
              (constrainFrameDuration &&
              mediaFiles[currentEditIndex].type === 'video'
                ? 'TRIM'
                : undefined)
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
                ? (filterString, look) => {
                    setMediaFiles(
                      mediaFiles.map((m, idx) => {
                        if (idx === currentEditIndex) return m;
                        return {
                          ...m,
                          filter: filterString,
                          editorState: { ...m.editorState, ...look },
                        };
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
