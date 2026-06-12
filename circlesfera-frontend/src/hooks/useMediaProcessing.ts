import { logger } from '../utils/logger';

/**
 * Hook/Utility for processing media files before upload.
 * Currently handles image normalization to standard JPEG using canvas.
 */
export function useMediaProcessing() {
  /**
   * Universal Image Normalizer
   * Forces any selected image (including HEIC/PNG/etc) into a standard JPEG
   * using a browser-native canvas capture. This ensures it can be rendered
   * during the StoryComposer export phase (html-to-image).
   */
  const normalizeImage = (file: File): Promise<File> => {
    return new Promise((resolve) => {
      // If it's a video, don't normalize
      if (file.type.startsWith('video/')) {
        return resolve(file);
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          // Scale down for mobile performance if too large, but keep high quality
          let width = img.width;
          let height = img.height;
          const MAX_DIM = 2000;
          if (width > MAX_DIM || height > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
            width *= ratio;
            height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve(file); // Fallback to original
          }

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file);
              const normalizedFile = new File(
                [blob],
                `${file.name.replace(/\.[^/.]+$/, '')}.jpg`,
                {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                },
              );
              resolve(normalizedFile);
            },
            'image/jpeg',
            0.95,
          );
        };
        img.onerror = () => resolve(file); // Fallback
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file); // Fallback
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: File[]) => {
    return Promise.all(
      files.map(async (file) => {
        if (file.type.startsWith('image/')) {
          try {
            return await normalizeImage(file);
          } catch (err) {
            logger.error('Normalization failed for:', file.name, err);
            return file; // Fallback to original
          }
        }
        return file;
      }),
    );
  };

  return {
    normalizeImage,
    processFiles,
  };
}
