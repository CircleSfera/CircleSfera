import {
  FRAME_COVER_IMAGE,
  FRAME_COVER_IMAGE_QUALITY,
} from '../../constants/frameCover';

/** Where the picture sits in its 9:16 frame: 0 to 1 on each axis, 0.5 centred. */
export interface CoverPlace {
  x: number;
  y: number;
}

/**
 * The part of a picture a 9:16 frame shows when the picture covers the frame
 * and sits at `place` (as CSS object-position in per cent / 100).
 */
export function coverCrop(
  picture: { width: number; height: number },
  place: CoverPlace,
): { sx: number; sy: number; sw: number; sh: number } {
  const ratio = FRAME_COVER_IMAGE.width / FRAME_COVER_IMAGE.height;
  const tall = picture.width / picture.height < ratio;
  const sw = tall ? picture.width : picture.height * ratio;
  const sh = tall ? picture.width / ratio : picture.height;
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
  return {
    sx: (picture.width - sw) * clamp(place.x),
    sy: (picture.height - sh) * clamp(place.y),
    sw,
    sh,
  };
}

/** The picture, framed at 9:16 where it was placed, as a JPEG file. */
export async function frameCoverImage(
  image: HTMLImageElement,
  place: CoverPlace,
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_COVER_IMAGE.width;
  canvas.height = FRAME_COVER_IMAGE.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The cover could not be drawn');
  const { sx, sy, sw, sh } = coverCrop(
    { width: image.naturalWidth, height: image.naturalHeight },
    place,
  );
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', FRAME_COVER_IMAGE_QUALITY),
  );
  if (!blob) throw new Error('The cover could not be drawn');
  return new File([blob], 'frame-cover.jpg', { type: 'image/jpeg' });
}
