import type { PlaceInput } from '@circlesfera/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { STORY_STICKER_MAX } from '../components/story/storyComposer.constants';
import type { StoryCanvasSize } from '../components/story/storyComposer.export';
import { stickersFromElements } from '../components/story/storyInteractive';
import {
  FRAME_MAX_DURATION_SEC,
  FRAME_MIN_DURATION_SEC,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
} from '../constants/uploadLimits';
import { interactiveApi, postsApi, storiesApi } from '../services';
import type {
  Audio as AudioTrack,
  CreatePostDto,
  CreateStoryDto,
  StoryElement,
} from '../types';
import { isFrameClipInRange } from '../utils/frameClip';
import { logger } from '../utils/logger';
import type {
  CreateMode,
  InteractiveDraft,
  MediaFile,
  PostTagData,
} from './useCreatePostState';
import type { UploadResult } from './useMediaUpload';

interface MutationDeps {
  mode: CreateMode;
  caption: string;
  hideLikes: boolean;
  turnOffComments: boolean;
  coverTimeMs: number | null;
  isSensitive: boolean;
  location: string;
  selectedPlace: PlaceInput | null;
  selectedAudio: AudioTrack | null;
  audioStartMs: number;
  isCloseFriendsOnly: boolean;
  isPremium: boolean;
  price: number;
  scheduledAt: string;
  interactiveDraft: InteractiveDraft;
  storyElements: StoryElement[];
  /** The canvas the story elements were placed on, once composed. */
  storyCanvasSize: StoryCanvasSize | null;
  mediaFiles: MediaFile[];
  altTextMap: Record<number, string>;
  tagsMap: Record<number, PostTagData[]>;
  isProcessingEdit: boolean;
  setIsProcessingEdit: (val: boolean) => void;
  uploadFiles: (
    files: MediaFile[],
    altTextMap: Record<number, string>,
  ) => Promise<UploadResult[]>;
  setShowFrameTrim: (val: boolean) => void;
}

// A media edit (filter, crop, trim, overlay) that could not be applied.
class EditExportError extends Error {}

export function useCreatePostMutation(deps: MutationDeps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createPostMutation = useMutation({
    mutationFn: async (data: CreatePostDto) => {
      const res = await postsApi.create(data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['frames'] });
    },
  });

  const createStoryMutation = useMutation({
    mutationFn: async (data: CreateStoryDto) => {
      return storiesApi.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
      queryClient.invalidateQueries({ queryKey: ['my-stories'] });
      navigate('/');
    },
  });

  const handleSubmit = async () => {
    if (deps.mediaFiles.length === 0) return;

    if (deps.caption.length > 2200) {
      toast.error(t('createPost.caption.too_long'));
      return;
    }

    if (
      deps.mode === 'STORY' &&
      stickersFromElements(deps.storyElements, deps.storyCanvasSize).length >
        STORY_STICKER_MAX
    ) {
      toast.error(
        t('createPost.storyComposer.stickers_limit', {
          max: STORY_STICKER_MAX,
        }),
      );
      return;
    }

    if (deps.mode === 'FRAME') {
      const clip = deps.mediaFiles[0];
      if (clip?.type !== 'video') {
        toast.error(t('createPost.upload.frame_video_only'));
        return;
      }
      const clipWindow = clip.videoData;
      if (!clipWindow || !isFrameClipInRange(clipWindow)) {
        toast.error(
          t('createPost.upload.frame_duration', {
            min: FRAME_MIN_DURATION_SEC,
            max: FRAME_MAX_DURATION_SEC,
          }),
        );
        deps.setShowFrameTrim(true);
        return;
      }
    }

    const oversized = deps.mediaFiles.filter(
      (m) => m.file.size > MAX_UPLOAD_BYTES,
    );
    if (oversized.length > 0) {
      toast.error(
        t('createPost.upload.file_too_large', {
          name: oversized[0].file.name,
          maxMb: MAX_UPLOAD_MB,
        }),
      );
      return;
    }

    try {
      deps.setIsProcessingEdit(true);

      const processedFilesPromises = deps.mediaFiles.map(async (m) => {
        if (!m.filter && !m.cropData && !m.overlayDataUrl && !m.videoData) {
          return m;
        }

        try {
          let exportedFile: File;
          if (m.type === 'video') {
            const { exportEditedVideo } = await import('../utils/videoExport');
            exportedFile = await exportEditedVideo(
              m.file,
              m.filter || '',
              m.videoData,
              m.overlayDataUrl,
            );
          } else {
            const { exportEditedImage } = await import('../utils/imageExport');
            exportedFile = await exportEditedImage(
              m.file,
              m.filter || '',
              m.cropData,
              m.overlayDataUrl,
            );
          }
          return {
            ...m,
            file: exportedFile,
            // A copy uploaded before the edit (to write its description) is
            // not this file: the edited one is what gets uploaded.
            remoteUrl: undefined,
          };
        } catch (e) {
          logger.error('Error exporting file, failing submission', e);
          throw new EditExportError('edit export failed');
        }
      });

      const finalMediaFiles = await Promise.all(processedFilesPromises);
      const uploadedMedia = await deps.uploadFiles(
        finalMediaFiles,
        deps.altTextMap,
      );

      if (deps.mode === 'STORY') {
        // The stickers of a composed story go with it; it is one picture.
        const stickers = stickersFromElements(
          deps.storyElements,
          deps.storyCanvasSize,
        );
        await Promise.all(
          finalMediaFiles.map((_, idx) =>
            createStoryMutation.mutateAsync({
              url: uploadedMedia[idx].url,
              standardUrl: uploadedMedia[idx].standardUrl,
              thumbnailUrl: uploadedMedia[idx].thumbnailUrl,
              mediaType: uploadedMedia[idx].type,
              isCloseFriendsOnly: deps.isCloseFriendsOnly,
              audioId: deps.selectedAudio?.id,
              audioStartMs: deps.selectedAudio ? deps.audioStartMs : 0,
              location: deps.location || undefined,
              place: deps.selectedPlace || undefined,
              isPremium: deps.isPremium,
              priceCents: deps.isPremium ? Math.round(deps.price * 100) : 0,
              scheduledAt: deps.scheduledAt
                ? new Date(deps.scheduledAt).toISOString()
                : undefined,
              ...(idx === 0 && stickers.length > 0 ? { stickers } : {}),
            }),
          ),
        );
      } else {
        const payload: CreatePostDto = {
          caption: deps.caption,
          hideLikes: deps.hideLikes,
          turnOffComments: deps.turnOffComments,
          media: uploadedMedia,
          type: deps.mode,
          // The cover of a frame, when its author chose one.
          ...(deps.mode === 'FRAME' &&
            deps.coverTimeMs !== null && { coverTimeMs: deps.coverTimeMs }),
          audioId: deps.selectedAudio?.id,
          audioStartMs: deps.selectedAudio ? deps.audioStartMs : 0,
          location: deps.location || undefined,
          place: deps.selectedPlace || undefined,
          tags: Object.values(deps.tagsMap)
            .flat()
            .map((t) => ({
              profileId: t.profileId,
              x: t.x,
              y: t.y,
            })),
          isPremium: deps.isPremium,
          priceCents: deps.isPremium ? Math.round(deps.price * 100) : 0,
          contentRating: deps.isSensitive ? 'MATURE' : 'GENERAL',
          scheduledAt: deps.scheduledAt
            ? new Date(deps.scheduledAt).toISOString()
            : undefined,
        };
        const created = await createPostMutation.mutateAsync(payload);
        const postId = created?.id;
        if (postId && deps.interactiveDraft?.kind === 'poll') {
          try {
            await interactiveApi.createPoll({
              question: deps.interactiveDraft.question,
              options: [...deps.interactiveDraft.options],
              postId,
            });
          } catch (pollError) {
            logger.error('Failed to create post poll:', pollError);
            toast.error(t('createPost.interactive.poll_create_failed'));
          }
        }
        if (postId && deps.interactiveDraft?.kind === 'qna') {
          try {
            await interactiveApi.createQna({
              prompt: deps.interactiveDraft.prompt,
              postId,
            });
          } catch (qnaError) {
            logger.error('Failed to create post QnA:', qnaError);
            toast.error(t('createPost.interactive.qna_create_failed'));
          }
        }
        navigate('/');
      }
    } catch (error: unknown) {
      // Upload and server errors carry technical, untranslated text: show
      // the app's own message instead.
      logger.error('Error creating content:', error);
      toast.error(
        t(
          error instanceof EditExportError
            ? 'createPost.upload.edit_export_error'
            : 'createPost.upload.publish_failed',
        ),
      );
    } finally {
      deps.setIsProcessingEdit(false);
    }
  };

  return {
    handleSubmit,
    isPending: createPostMutation.isPending || createStoryMutation.isPending,
  };
}
