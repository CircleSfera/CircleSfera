import { useState } from 'react';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../constants/uploadLimits';
import i18n from '../i18n';
import { api } from '../services';
import { apiErrorCode, apiErrorMessage } from '../utils/apiErrorMessage';
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
            // A known error code (for example a video that is too long)
            // explains the failure; otherwise the generic upload message.
            const code = apiErrorCode(error);
            const displayMessage = code
              ? i18n.t(`errors.codes.${code}`, { defaultValue: '' })
              : '';

            if (httpStatus === 413 || item.file.size > MAX_UPLOAD_BYTES) {
              throw new Error(
                i18n.t('createPost.upload.file_too_large', {
                  name: item.file.name,
                  maxMb: MAX_UPLOAD_MB,
                }),
              );
            }
            // Offline, too many uploads, an ended session or a server error
            // say so; anything else is a failed upload of this file.
            const isKnownFailure =
              (err as { isNetworkError?: boolean }).isNetworkError === true ||
              httpStatus === 401 ||
              httpStatus === 429 ||
              (httpStatus !== undefined && httpStatus >= 500);
            throw new Error(
              displayMessage ||
                (isKnownFailure ? apiErrorMessage(error, i18n.t) : '') ||
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
