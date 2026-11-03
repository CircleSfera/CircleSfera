import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CREATE_PRIMARY, CREATE_SECONDARY } from '../create-post/createStyles';
import { type CoverPlace, frameCoverImage } from './frameCoverImage';

interface FrameCoverImageCropProps {
  file: File;
  onDone: (cover: File) => void;
  onCancel: () => void;
}

/**
 * An image chosen as a Frame's cover, in the Frame's 9:16 frame: dragged to
 * place it, then kept as the picture the frame shows.
 */
export default function FrameCoverImageCrop({
  file,
  onDone,
  onCancel,
}: FrameCoverImageCropProps) {
  const { t } = useTranslation();
  const imageRef = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState('');
  const [place, setPlace] = useState<CoverPlace>({ x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; from: CoverPlace } | null>(null);

  useEffect(() => {
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);

  return (
    <div className="space-y-4" data-testid="frame-cover-image-crop">
      <div className="mx-auto aspect-9/16 h-[min(40dvh,26rem)] overflow-hidden rounded-2xl border border-white/10 bg-black">
        {url ? (
          <img
            ref={imageRef}
            src={url}
            alt={t('frames.cover.image_preview')}
            draggable={false}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, from: place };
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              const box = e.currentTarget.getBoundingClientRect();
              if (!start || box.width === 0) return;
              // Dragging the picture right shows more of its left side.
              const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
              setPlace({
                x: clamp(start.from.x - (e.clientX - start.x) / box.width),
                y: clamp(start.from.y - (e.clientY - start.y) / box.height),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            className="h-full w-full cursor-grab touch-none object-cover active:cursor-grabbing"
            style={{ objectPosition: `${place.x * 100}% ${place.y * 100}%` }}
          />
        ) : null}
      </div>
      <p className="text-center text-xs text-white/60">
        {t('frames.cover.image_drag')}
      </p>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={onCancel} className={CREATE_SECONDARY}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={busy || !url}
          onClick={async () => {
            const image = imageRef.current;
            if (!image) return;
            setBusy(true);
            try {
              onDone(await frameCoverImage(image, place));
            } finally {
              setBusy(false);
            }
          }}
          className={CREATE_PRIMARY}
        >
          {t('frames.cover.image_use')}
        </button>
      </div>
    </div>
  );
}
