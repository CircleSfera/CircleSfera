import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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

interface MutationDeps {
  mode: CreateMode;
  caption: string;
  hideLikes: boolean;
  turnOffComments: boolean;
  isSensitive: boolean;
  location: string;
  selectedPlace: any;
  selectedAudio: AudioTrack | null;
  audioStartMs: number;
  isCloseFriendsOnly: boolean;
  isPremium: boolean;
  price: number;
  scheduledAt: string;
  interactiveDraft: InteractiveDraft;
  storyElements: StoryElement[];
  mediaFiles: MediaFile[];
  altTextMap: Record<number, string>;
  tagsMap: Record<number, PostTagData[]>;
  isProcessingEdit: boolean;
  setIsProcessingEdit: (val: boolean) => void;
  uploadFiles: (
    files: MediaFile[],
    altTextMap: Record<number, string>,
  ) => Promise<any[]>;
  setShowFrameTrim: (val: boolean) => void;
}

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
          };
        } catch (e) {
          logger.error('Error exporting file, failing submission', e);
          throw new Error(
            'No se pudo procesar la edición del archivo. Por favor, inténtalo de nuevo.',
          );
        }
      });

      const finalMediaFiles = await Promise.all(processedFilesPromises);
      const uploadedMedia = await deps.uploadFiles(
        finalMediaFiles,
        deps.altTextMap,
      );

      if (deps.mode === 'STORY') {
        const createdStories = await Promise.all(
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
            }),
          ),
        );

        const pollElement = deps.storyElements.find((el) => {
          const type = el.type as string;
          return (
            type === 'poll' ||
            (typeof el.content === 'string' &&
              el.content.startsWith('{"question"'))
          );
        });
        if (pollElement && createdStories[0]?.data?.id) {
          try {
            const pollPayload =
              typeof pollElement.content === 'string'
                ? JSON.parse(pollElement.content)
                : pollElement.content;
            if (pollPayload?.question && Array.isArray(pollPayload?.options)) {
              await interactiveApi.createPoll({
                question: pollPayload.question,
                options: pollPayload.options,
                storyId: createdStories[0].data.id,
              });
            }
          } catch (pollError) {
            logger.error('Failed to create story poll:', pollError);
            toast.error(t('createPost.story.poll_create_error'));
          }
        }

        const qnaElement = deps.storyElements.find((el) => {
          const type = el.type as string;
          return (
            type === 'qna' ||
            (typeof el.content === 'string' &&
              el.content.startsWith('{"prompt"'))
          );
        });
        if (qnaElement && createdStories[0]?.data?.id) {
          try {
            const qnaPayload =
              typeof qnaElement.content === 'string'
                ? JSON.parse(qnaElement.content)
                : qnaElement.content;
            if (qnaPayload?.prompt) {
              await interactiveApi.createQna({
                prompt: qnaPayload.prompt,
                storyId: createdStories[0].data.id,
              });
            }
          } catch (qnaError) {
            logger.error('Failed to create story QnA:', qnaError);
            toast.error(
              t(
                'createPost.story.qna_create_error',
                'Story published, but Q&A could not be created.',
              ),
            );
          }
        }
      } else {
        const payload: CreatePostDto = {
          caption: deps.caption,
          hideLikes: deps.hideLikes,
          turnOffComments: deps.turnOffComments,
          media: uploadedMedia,
          type: deps.mode,
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
      logger.error('Error creating content:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create content. Please try again.';
      toast.error(message);
    } finally {
      deps.setIsProcessingEdit(false);
    }
  };

  return {
    handleSubmit,
    isPending: createPostMutation.isPending || createStoryMutation.isPending,
  };
}
