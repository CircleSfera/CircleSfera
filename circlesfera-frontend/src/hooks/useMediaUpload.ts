import { useState } from 'react';
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
    mediaFiles: { file: File; filter?: string; type: string }[],
    altTextMap: Record<number, string>,
  ): Promise<UploadResult[]> => {
    setIsUploading(true);
    try {
      const results = await Promise.all(
        mediaFiles.map(async (item, idx) => {
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
            const axiosErr = error as {
              response?: {
                data?: { message?: string | string[] };
                status?: number;
              };
            };
            const serverMessage = axiosErr.response?.data?.message;
            const displayMessage = Array.isArray(serverMessage)
              ? serverMessage[0]
              : serverMessage;

            if (axiosErr.response?.status === 413) {
              throw new Error(
                `File ${item.file.name} is too large. Max size is 100MB.`,
              );
            }
            throw new Error(
              displayMessage || `Failed to upload ${item.file.name}`,
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
