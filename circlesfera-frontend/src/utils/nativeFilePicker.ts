import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import type React from 'react';

/**
 * Prompts the user with a native iOS/Android camera/gallery action sheet
 * if running on a native device. Injects the selected image into the
 * provided hidden <input type="file"> reference to maintain web compatibility.
 *
 * @param fileInputRef Reference to the hidden file input
 * @returns true if handled natively (even if cancelled), false if it should fallback to web
 */
export const pickNativeImage = async (
  fileInputRef:
    | React.RefObject<HTMLInputElement | null>
    | React.MutableRefObject<HTMLInputElement | null>,
): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      quality: 90,
      allowEditing: false,
    });

    if (photo.webPath && fileInputRef.current) {
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const file = new File([blob], `image_${Date.now()}.${photo.format}`, {
        type: `image/${photo.format}`,
      });

      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      fileInputRef.current.dispatchEvent(
        new Event('change', { bubbles: true }),
      );
    }
    return true; // We handled it natively
  } catch (err) {
    console.warn('Native image picker cancelled or failed', err);
    return true; // Handled natively (user cancelled), don't fallback to web picker
  }
};
