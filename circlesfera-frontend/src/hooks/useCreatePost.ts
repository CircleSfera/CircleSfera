import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CropData, VideoData } from '../components/PhotoEditor';
import { api, storiesApi } from '../services';
import type {
  Audio as AudioTrack,
  CreatePostDto,
  CreateStoryDto,
  StoryElement,
} from '../types';
import { logger } from '../utils/logger';
import { useMediaProcessing } from './useMediaProcessing';
import { useMediaUpload } from './useMediaUpload';

export type CreateMode = 'POST' | 'STORY' | 'FRAME';
export type Step = 'upload' | 'edit' | 'caption';
export type SubScreen =
  | 'none'
  | 'location'
  | 'accessibility'
  | 'advanced'
  | 'tags'
  | 'monetization';

export interface PostTagData {
  userId: string;
  username: string;
  x: number;
  y: number;
}

export interface MediaFile {
  file: File;
  url: string; // Blob URL
  type: 'image' | 'video';
  filter?: string;
  cropData?: CropData;
  overlayDataUrl?: string;
  videoData?: VideoData;
}

export function useCreatePost() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode =
    searchParams.get('mode') === 'story'
      ? 'STORY'
      : searchParams.get('mode') === 'frame'
        ? 'FRAME'
        : 'POST';

  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [step, setStep] = useState<Step>('upload');
  const [subScreen, setSubScreen] = useState<SubScreen>('none');

  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [hideLikes, setHideLikes] = useState(false);
  const [turnOffComments, setTurnOffComments] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<AudioTrack | null>(null);
  const [isCloseFriendsOnly, setIsCloseFriendsOnly] = useState(false);
  const [altTextMap, setAltTextMap] = useState<Record<number, string>>({});
  const [tagsMap, setTagsMap] = useState<Record<number, PostTagData[]>>({});
  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState<number>(0);

  // Story Specific Persistence
  const [storyElements, setStoryElements] = useState<StoryElement[]>([]);
  const [storyBgStyle, setStoryBgStyle] = useState<string>('');
  const [isComposed, setIsComposed] = useState(false);
  const [originalStoryMedia, setOriginalStoryMedia] = useState<{
    file: File;
    url: string;
    type: 'image' | 'video';
  } | null>(null);

  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { processFiles } = useMediaProcessing();
  const { isUploading, uploadFiles } = useMediaUpload();

  const createPostMutation = useMutation({
    mutationFn: async (data: CreatePostDto) => {
      const res = await api.post('/posts', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['frames'] });
      navigate('/');
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);

      const processedFiles = await processFiles(selectedFiles);

      const newFiles = processedFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        type: file.type.startsWith('video')
          ? 'video'
          : ('image' as 'image' | 'video'),
      }));

      if (mode === 'STORY' && newFiles.length > 0) {
        setOriginalStoryMedia(newFiles[0]);
      }

      setMediaFiles((prev) => [...prev, ...newFiles]);
      setStep('edit');
    }
  };

  const [isProcessingEdit, setIsProcessingEdit] = useState(false);

  const handleFilterSave = async (
    file: File,
    filterString: string,
    cropData?: CropData,
    overlayDataUrl?: string,
    videoData?: VideoData,
  ) => {
    if (currentEditIndex !== null) {
      setMediaFiles((prev) => {
        const updated = [...prev];
        updated[currentEditIndex] = {
          ...updated[currentEditIndex],
          file, // Actualizamos la referencia del archivo por si cambia externamente
          filter: filterString,
          cropData,
          overlayDataUrl,
          videoData,
        };
        return updated;
      });
      setCurrentEditIndex(null);
    }
  };

  const handleRemoveFile = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    setAltTextMap((prev) => {
      const updated = { ...prev };
      delete updated[index];
      const newMap: Record<number, string> = {};
      Object.entries(updated).forEach(([key, value]) => {
        const k = Number.parseInt(key, 10);
        if (k > index) newMap[k - 1] = value;
        else newMap[k] = value;
      });
      return newMap;
    });
    setTagsMap((prev) => {
      const updated = { ...prev };
      delete updated[index];
      const newMap: Record<number, PostTagData[]> = {};
      Object.entries(updated).forEach(([key, value]) => {
        const k = Number.parseInt(key, 10);
        if (k > index) newMap[k - 1] = value;
        else newMap[k] = value;
      });
      return newMap;
    });

    if (mediaFiles.length <= 1) {
      setStep('upload');
    }
  };

  const generateAltTextForIndex = async (index: number) => {
    const item = mediaFiles[index];
    if (!item || item.type !== 'image') return;

    try {
      // 1. Upload the file first if it doesn't have a URL yet (it should have a blob URL)
      // Actually, we need a public URL for the AI to see it, OR we send the buffer.
      // For simplicity in this flow, we assume the user might have already uploaded or we use the blob if the AI is local.
      // But our backend AI expects a URL.
      // So we upload it first.
      const uploaded = await uploadFiles([item], {});
      const publicUrl = uploaded[0].url;

      // 2. Call AI service
      const res = await api.post('/ai/alt-text', { imageUrl: publicUrl });

      // 3. Update the map
      setAltTextMap((prev) => ({
        ...prev,
        [index]: res.data.text,
      }));
    } catch (error) {
      logger.error('Failed to generate AI alt-text:', error);
    }
  };

  const handleSubmit = async () => {
    if (mediaFiles.length === 0) return;

    try {
      setIsProcessingEdit(true);

      // Batch export all files with their respective edits before uploading
      const processedFilesPromises = mediaFiles.map(async (m) => {
        // If there are no edits, just return the original file
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
            // Keep filter string for UI consistency or if needed later
          };
        } catch (e) {
          console.error('Error exporting file, falling back to original', e);
          return m;
        }
      });

      const finalMediaFiles = await Promise.all(processedFilesPromises);

      const uploadedMedia = await uploadFiles(finalMediaFiles, altTextMap);

      if (mode === 'STORY') {
        await Promise.all(
          finalMediaFiles.map((_, idx) =>
            createStoryMutation.mutateAsync({
              url: uploadedMedia[idx].url,
              standardUrl: uploadedMedia[idx].standardUrl,
              thumbnailUrl: uploadedMedia[idx].thumbnailUrl,
              mediaType: uploadedMedia[idx].type,
              isCloseFriendsOnly,
              audioId: selectedAudio?.id,
            }),
          ),
        );
      } else {
        const payload: CreatePostDto = {
          caption,
          location,
          hideLikes,
          turnOffComments,
          media: uploadedMedia,
          type: mode,
          audioId: selectedAudio?.id,
          tags: Object.values(tagsMap)
            .flat()
            .map((t) => ({
              userId: t.userId,
              x: t.x,
              y: t.y,
            })),
          isPremium,
          priceCents: isPremium ? Math.round(price * 100) : 0,
        };
        await createPostMutation.mutateAsync(payload);
      }
    } catch (error: unknown) {
      logger.error('Error creating content:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create content. Please try again.';
      alert(message);
    } finally {
      setIsProcessingEdit(false);
    }
  };

  const reset = () => {
    if (step === 'edit') {
      if (mode === 'STORY' && isComposed) {
        setStep('upload');
        setIsComposed(false);
      } else {
        setStep('upload');
      }
    } else if (step === 'caption') {
      setStep('edit');
    } else {
      if (mediaFiles.length > 0 || caption.length > 0) {
        if (window.confirm('Discard this post? Your changes will be lost.')) {
          navigate(-1);
        }
      } else {
        navigate(-1);
      }
    }
  };

  return {
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
    isPremium,
    setIsPremium,
    price,
    setPrice,
    isUploading,
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
    isPending:
      createPostMutation.isPending ||
      createStoryMutation.isPending ||
      isUploading,
    isProcessingEdit,
  };
}
