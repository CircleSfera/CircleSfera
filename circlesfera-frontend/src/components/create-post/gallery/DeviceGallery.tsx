import { Camera, Images, Loader2, Play } from 'lucide-react';
import type { MutableRefObject, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  type GalleryItem,
  PhotoLibrary,
  readGalleryFile,
} from '../../../utils/photoLibrary';
import { CREATE_GLASS_ICON } from '../createStyles';
import { useDeviceGallery } from './useDeviceGallery';

interface DeviceGalleryProps {
  /** A frame takes one video; a post or a story, photos and videos. */
  videosOnly: boolean;
  single: boolean;
  /** The shape of what is being created, as a CSS aspect ratio. */
  ratio: string;
  /** Where the chosen files go, so they take the path of files picked by hand. */
  fileInputRef: MutableRefObject<HTMLInputElement | null>;
  /** Says how to continue with the selection, or that there is none. */
  onContinueChange: (proceed: (() => void) | null) => void;
  onPickOther: () => void;
  onOpenCamera?: (e: React.MouseEvent) => void;
  /** What to show when the photos cannot be listed. */
  fallback: (reason: 'denied' | 'failed') => ReactNode;
  /** Shown under the grid, only while the gallery itself is on show. */
  footer?: ReactNode;
}

const formatDuration = (seconds: number) => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The upload step of the iOS app: the item last tapped on top, the recent
 * photos and videos of the device below, as Instagram does.
 */
export default function DeviceGallery({
  videosOnly,
  single,
  ratio,
  fileInputRef,
  onContinueChange,
  onPickOther,
  onOpenCamera,
  fallback,
  footer,
}: DeviceGalleryProps) {
  const { t } = useTranslation();
  const gallery = useDeviceGallery(videosOnly);
  const { items, status } = gallery;
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // The most recent item is chosen when the gallery opens.
  useEffect(() => {
    if (status === 'ready' && previewId === null && items.length > 0) {
      setPreviewId(items[0].id);
      setSelected([items[0].id]);
    }
  }, [status, items, previewId]);

  // A larger picture of the item on show; its thumbnail meanwhile.
  useEffect(() => {
    if (!previewId) return;
    let current = true;
    setPicture(null);
    PhotoLibrary.preview({ id: previewId, size: 1080 })
      .then(({ picture: next }) => {
        if (current) setPicture(next);
      })
      .catch(() => {
        // The thumbnail stays on show.
      });
    return () => {
      current = false;
    };
  }, [previewId]);

  // More items as the end of the grid comes into view.
  const { hasMore, loadMore } = gallery;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const tap = (item: GalleryItem) => {
    if (single) {
      setSelected([item.id]);
      setPreviewId(item.id);
      return;
    }
    const isSelected = selected.includes(item.id);
    if (!isSelected) {
      setSelected([...selected, item.id]);
      setPreviewId(item.id);
    } else if (previewId === item.id) {
      // Tapping the item on show again leaves it out.
      const rest = selected.filter((id) => id !== item.id);
      setSelected(rest);
      if (rest.length > 0) setPreviewId(rest[rest.length - 1]);
    } else {
      setPreviewId(item.id);
    }
  };

  const proceed = useCallback(async () => {
    const input = fileInputRef.current;
    if (!input || selected.length === 0) return;
    setBusy(true);
    try {
      const files: File[] = [];
      for (const id of selected) files.push(await readGalleryFile(id));
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // The files are in memory now; the copies on disk are not needed.
      void PhotoLibrary.clearExports().catch(() => undefined);
    } catch {
      toast.error(t('createPost.upload.gallery_read_failed'));
    } finally {
      setBusy(false);
    }
  }, [fileInputRef, selected, t]);

  useEffect(() => {
    onContinueChange(
      selected.length > 0 && !busy ? () => void proceed() : null,
    );
  }, [selected.length, busy, proceed, onContinueChange]);
  useEffect(() => () => onContinueChange(null), [onContinueChange]);

  if (status === 'denied' || status === 'failed') return fallback(status);

  const shown = items.find((item) => item.id === previewId);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col gap-2">
      <div className="h-[42dvh] shrink-0 flex justify-center">
        <div
          className="relative h-full max-w-full overflow-hidden rounded-3xl border border-white/10 bg-black"
          style={{ aspectRatio: ratio }}
        >
          {shown ? (
            <img
              src={picture ?? shown.thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : null}
          {shown?.isVideo ? (
            <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
              <Play size={12} aria-hidden />
              {formatDuration(shown.duration ?? 0)}
            </span>
          ) : null}
          {status === 'loading' ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2
                className="animate-spin text-white/55"
                size={28}
                aria-hidden
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <h2 className="flex-1 text-base font-semibold text-white">
          {t('createPost.upload.gallery_recent')}
        </h2>
        <button
          type="button"
          onClick={onPickOther}
          className={CREATE_GLASS_ICON}
          aria-label={t('createPost.upload.gallery_other')}
        >
          <Images size={18} aria-hidden />
        </button>
        {onOpenCamera ? (
          <button
            type="button"
            onClick={onOpenCamera}
            className={CREATE_GLASS_ICON}
            aria-label={t('createPost.upload.take_photo')}
          >
            <Camera size={18} aria-hidden />
          </button>
        ) : null}
      </div>

      {gallery.access === 'limited' ? (
        <div className="flex items-center gap-3 shrink-0 rounded-2xl bg-white/5 px-3 py-1">
          <p className="flex-1 text-xs text-white/70">
            {t('createPost.upload.gallery_limited')}
          </p>
          <button
            type="button"
            onClick={() => void gallery.manageAccess()}
            className="min-h-11 px-3 text-sm font-semibold text-brand-primary-text"
          >
            {t('createPost.upload.gallery_manage')}
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto -mx-4">
        {status === 'ready' && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-white/55">
            {t('createPost.upload.gallery_empty')}
          </p>
        ) : null}
        <div className="grid grid-cols-4 gap-0.5">
          {items.map((item, index) => {
            const order = selected.indexOf(item.id);
            const label = item.isVideo
              ? t('createPost.upload.gallery_video', {
                  index: index + 1,
                  duration: formatDuration(item.duration ?? 0),
                })
              : t('createPost.upload.gallery_photo', { index: index + 1 });
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => tap(item)}
                aria-pressed={order >= 0}
                aria-label={label}
                className="relative aspect-square overflow-hidden bg-white/5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40"
              >
                <img
                  src={item.thumbnail}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                {item.id === previewId ? (
                  <span className="absolute inset-0 bg-white/25" aria-hidden />
                ) : null}
                {!single ? (
                  <span
                    aria-hidden
                    className={`absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
                      order >= 0
                        ? 'border-transparent bg-brand-primary text-(color:--on-brand-primary)'
                        : 'border-white/80 bg-black/20'
                    }`}
                  >
                    {order >= 0 ? order + 1 : ''}
                  </span>
                ) : null}
                {item.isVideo ? (
                  <span className="absolute bottom-1 right-1.5 text-xs font-semibold text-white drop-shadow">
                    {formatDuration(item.duration ?? 0)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div ref={sentinelRef} className="h-px" />
      </div>

      {footer}

      {busy ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70">
          <Loader2 className="animate-spin text-white" size={28} aria-hidden />
          <p className="text-sm text-white">
            {t('createPost.upload.gallery_preparing')}
          </p>
        </div>
      ) : null}
    </div>
  );
}
