import { useState } from 'react';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../constants/uploadLimits';
import i18n from '../i18n';
import { api } from '../services';
import { logger } from '../utils/logger';

export interface UploadResult {
  url: string;
  standardUrl?: string;
  thumbnailUrl?: string;
  type: string;
  filter?: string;
  altText: string;
}

export function useMediaUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = async (
    mediaFiles: {
      file: File;
      filter?: string;
      type: string;
      remoteUrl?: string;
    }[],
    altTextMap: Record<number, string>,
  ): Promise<UploadResult[]> => {
    setIsUploading(true);
    try {
      const results = await Promise.all(
        mediaFiles.map(async (item, idx) => {
          if (item.file.size > MAX_UPLOAD_BYTES) {
            throw new Error(
              i18n.t('createPost.upload.file_too_large', {
                name: item.file.name,
                maxMb: MAX_UPLOAD_MB,
              }),
            );
          }

          if (item.remoteUrl) {
            return {
              url: item.remoteUrl,
              type: item.type,
              filter: item.filter,
              altText: altTextMap[idx] || '',
            };
          }

          const formData = new FormData();
          formData.append('file', item.file);

          try {
            const response = await api.post<
              Omit<UploadResult, 'filter' | 'altText'>
            >('/uploads', formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });

            return {
              ...response.data,
              filter: item.filter,
              altText: altTextMap[idx] || '',
            };
          } catch (error: unknown) {
            logger.error('Upload failed for file:', item.file.name, error);
            const err = error as {
              response?: {
                data?: { message?: string | string[] };
                status?: number;
              };
              status?: number;
              message?: string;
            };
            const httpStatus = err.response?.status ?? err.status;
            const serverMessage = err.response?.data?.message;
            const displayMessage = Array.isArray(serverMessage)
              ? serverMessage[0]
              : serverMessage;

            if (httpStatus === 413 || item.file.size > MAX_UPLOAD_BYTES) {
              throw new Error(
                i18n.t('createPost.upload.file_too_large', {
                  name: item.file.name,
                  maxMb: MAX_UPLOAD_MB,
                }),
              );
            }
            throw new Error(
              displayMessage ||
                err.message ||
                i18n.t('createPost.upload.upload_failed', {
                  name: item.file.name,
                }),
            );
          }
        }),
      );
      return results;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    isUploading,
    uploadFiles,
  };
}
