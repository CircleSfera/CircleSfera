import { Capacitor, registerPlugin } from '@capacitor/core';

/** One recent photo or video of the device. */
export interface GalleryItem {
  id: string;
  /** A small square JPEG, as a data address. */
  thumbnail: string;
  isVideo: boolean;
  /** Seconds, for a video. */
  duration?: number;
}

/** What the person allowed: everything, a selection, or nothing. */
export type GalleryAccess = 'full' | 'limited' | 'denied';

interface PhotoLibraryPlugin {
  requestAccess(): Promise<{ access: GalleryAccess }>;
  manageLimitedAccess(): Promise<void>;
  recent(options: {
    offset: number;
    limit: number;
    kind: 'all' | 'videos';
    thumbnailSize: number;
  }): Promise<{ items: GalleryItem[]; total: number }>;
  preview(options: { id: string; size: number }): Promise<{ picture: string }>;
  exportItem(options: {
    id: string;
  }): Promise<{ path: string; name: string; mimeType: string }>;
  clearExports(): Promise<void>;
}

/** The app's own plugin over the photo library of iOS (`PhotoLibraryPlugin.swift`). */
export const PhotoLibrary = registerPlugin<PhotoLibraryPlugin>('PhotoLibrary');

/**
 * Whether the upload step can show the device's photos. Only the iOS app:
 * a web page cannot read the library, and on Android the system photo
 * picker is used instead of a broad photo permission.
 */
export const hasDeviceGallery = () => Capacitor.getPlatform() === 'ios';

/** Reads one item of the library as a file, as if it had been picked by hand. */
export async function readGalleryFile(id: string): Promise<File> {
  const exported = await PhotoLibrary.exportItem({ id });
  // The app's own file address answers a video with status 0 and the whole
  // file, so what decides is whether anything came back.
  const response = await fetch(Capacitor.convertFileSrc(exported.path));
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('The copied item could not be read');
  return new File([blob], exported.name, { type: exported.mimeType });
}
