import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { CropData, VideoData } from '../components/PhotoEditor';
import {
  FRAME_MIN_DURATION_SEC,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  POST_MAX_DURATION_SEC,
  probeVideoDuration,
  STORY_MAX_DURATION_SEC,
} from '../constants/uploadLimits';
import { aiApi } from '../services';
import { defaultFrameWindow } from '../utils/frameClip';
import { logger } from '../utils/logger';
import type {
  CreateMode,
  MediaFile,
  PostTagData,
  Step,
} from './useCreatePostState';
import { useMediaProcessing } from './useMediaProcessing';
import { useMediaUpload } from './useMediaUpload';

interface UseCreatePostMediaProps {
  mode: CreateMode;
  setStep: (step: Step) => void;
  setShowFrameTrim: (show: boolean) => void;
  setFrameSourceDurationSec: (sec: number) => void;
  setOriginalStoryMedia: (
    media: { file: File; url: string; type: 'image' | 'video' } | null,
  ) => void;
}

export function useCreatePostMedia({
  mode,
  setStep,
  setShowFrameTrim,
  setFrameSourceDurationSec,
  setOriginalStoryMedia,
}: UseCreatePostMediaProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null);
  const [altTextMap, setAltTextMap] = useState<Record<number, string>>({});
  const [tagsMap, setTagsMap] = useState<Record<number, PostTagData[]>>({});
  const [isProcessingEdit, setIsProcessingEdit] = useState(false);

  const { processFiles } = useMediaProcessing();
  const { isUploading, uploadFiles } = useMediaUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let selectedFiles = Array.from(e.target.files);

      if (mode === 'FRAME') {
        const nonVideo = selectedFiles.filter(
          (f) => !f.type.startsWith('video/'),
        );
        if (nonVideo.length > 0) {
          toast.error(t('createPost.upload.frame_video_only'));
          e.target.value = '';
          return;
        }
        selectedFiles = selectedFiles.slice(0, 1);
      }

      const oversized = selectedFiles.filter(
        (file) => file.size > MAX_UPLOAD_BYTES,
      );
      if (oversized.length > 0) {
        toast.error(
          t('createPost.upload.file_too_large', {
            name: oversized[0].name,
            maxMb: MAX_UPLOAD_MB,
          }),
        );
        e.target.value = '';
        return;
      }

      let frameDuration = 0;
      if (mode === 'FRAME') {
        try {
          frameDuration = await probeVideoDuration(selectedFiles[0]);
          if (frameDuration < FRAME_MIN_DURATION_SEC) {
            toast.error(
              t('createPost.upload.frame_too_short', {
                min: FRAME_MIN_DURATION_SEC,
              }),
            );
            e.target.value = '';
            return;
          }
        } catch {
          toast.error(t('createPost.upload.frame_duration_probe_failed'));
          e.target.value = '';
          return;
        }
      } else {
        const videos = selectedFiles.filter((f) => f.type.startsWith('video/'));
        for (const video of videos) {
          try {
            const duration = await probeVideoDuration(video);
            if (mode === 'STORY' && duration > STORY_MAX_DURATION_SEC) {
              toast.error(
                t('createPost.upload.story_duration', {
                  max: STORY_MAX_DURATION_SEC,
                }),
              );
              e.target.value = '';
              return;
            }
            if (mode === 'POST' && duration > POST_MAX_DURATION_SEC) {
              toast.error(
                t('createPost.upload.post_duration', {
                  max: POST_MAX_DURATION_SEC,
                }),
              );
              e.target.value = '';
              return;
            }
          } catch {
            toast.error(t('createPost.upload.frame_duration_probe_failed'));
            e.target.value = '';
            return;
          }
        }
      }

      const processedFiles = await processFiles(selectedFiles);

      const newFiles: MediaFile[] = processedFiles.map((file) => {
        const type = file.type.startsWith('video')
          ? ('video' as const)
          : ('image' as const);
        const url = URL.createObjectURL(file);
        return { file, url, type };
      });

      if (mode === 'STORY' && newFiles.length > 0) {
        setOriginalStoryMedia(newFiles[0]);
      }

      if (mode === 'FRAME') {
        const clip = defaultFrameWindow(frameDuration);
        const frameFile: MediaFile = {
          ...newFiles[0],
          videoData: {
            startTime: clip.startTime,
            endTime: clip.endTime,
            muted: false,
          },
        };
        setMediaFiles([frameFile]);
        setFrameSourceDurationSec(frameDuration);
        setShowFrameTrim(true);
        setStep('edit');
      } else {
        setMediaFiles((prev) => [...prev, ...newFiles]);
        setStep('edit');
      }
    }
  };

  const handleFrameTrimConfirm = (videoData: VideoData) => {
    setMediaFiles((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], videoData, remoteUrl: undefined };
      return updated;
    });
    setShowFrameTrim(false);
  };

  const handleFrameTrimCancel = () => {
    setShowFrameTrim(false);
    setFrameSourceDurationSec(0);
    setMediaFiles((prev) => {
      for (const m of prev) {
        if (m.url.startsWith('blob:')) URL.revokeObjectURL(m.url);
      }
      return [];
    });
    setStep('upload');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFilterSave = async (
    file: File,
    filterString: string,
    cropData?: CropData,
    overlayDataUrl?: string,
    videoData?: VideoData,
  ) => {
    if (currentEditIndex !== null) {
      const type = file.type.startsWith('video')
        ? ('video' as const)
        : ('image' as const);
      const prev = mediaFiles[currentEditIndex];
      if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
      const url = URL.createObjectURL(file);
      setMediaFiles((list) => {
        const updated = [...list];
        updated[currentEditIndex] = {
          ...updated[currentEditIndex],
          file,
          url,
          type,
          remoteUrl: undefined,
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
    if (item?.type !== 'image') return;

    try {
      const uploaded = await uploadFiles([item], {});
      const publicUrl = uploaded[0].url;

      setMediaFiles((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], remoteUrl: publicUrl };
        return updated;
      });

      const res = await aiApi.generateAltText(publicUrl);

      setAltTextMap((prev) => ({
        ...prev,
        [index]: res.data.text,
      }));
    } catch (error) {
      logger.error('Failed to generate AI alt-text:', error);
    }
  };

  return {
    mediaFiles,
    setMediaFiles,
    currentEditIndex,
    setCurrentEditIndex,
    altTextMap,
    setAltTextMap,
    tagsMap,
    setTagsMap,
    isProcessingEdit,
    setIsProcessingEdit,
    isUploading,
    uploadFiles,
    fileInputRef,
    handleFileSelect,
    handleFrameTrimConfirm,
    handleFrameTrimCancel,
    handleFilterSave,
    handleRemoveFile,
    generateAltTextForIndex,
  };
}
