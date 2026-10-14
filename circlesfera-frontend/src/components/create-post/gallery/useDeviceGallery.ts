import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type GalleryAccess,
  type GalleryItem,
  PhotoLibrary,
} from '../../../utils/photoLibrary';

const PAGE = 60;
// Square tiles of a quarter of a phone's width, at the screen's density.
const THUMBNAIL_PX = 300;

export type GalleryStatus = 'loading' | 'ready' | 'denied' | 'failed';

/**
 * The recent media of the device, sixty at a time. Asks for access the
 * first time; a frame lists videos only.
 */
export function useDeviceGallery(videosOnly: boolean) {
  const [status, setStatus] = useState<GalleryStatus>('loading');
  const [access, setAccess] = useState<GalleryAccess>('denied');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const loadingMore = useRef(false);
  const kind = videosOnly ? 'videos' : 'all';

  const loadFirstPage = useCallback(async () => {
    setStatus('loading');
    try {
      const answer = await PhotoLibrary.requestAccess();
      setAccess(answer.access);
      if (answer.access === 'denied') {
        setStatus('denied');
        return;
      }
      const page = await PhotoLibrary.recent({
        offset: 0,
        limit: PAGE,
        kind,
        thumbnailSize: THUMBNAIL_PX,
      });
      setItems(page.items);
      setTotal(page.total);
      setStatus('ready');
    } catch {
      setStatus('failed');
    }
  }, [kind]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore.current || items.length >= total) return;
    loadingMore.current = true;
    try {
      const page = await PhotoLibrary.recent({
        offset: items.length,
        limit: PAGE,
        kind,
        thumbnailSize: THUMBNAIL_PX,
      });
      setItems((current) => [...current, ...page.items]);
      setTotal(page.total);
    } catch {
      // The items already shown stay; scrolling again tries again.
    } finally {
      loadingMore.current = false;
    }
  }, [items.length, total, kind]);

  /** A person with limited access chooses more items, and the list follows. */
  const manageAccess = useCallback(async () => {
    try {
      await PhotoLibrary.manageLimitedAccess();
    } finally {
      await loadFirstPage();
    }
  }, [loadFirstPage]);

  return {
    status,
    access,
    items,
    hasMore: items.length < total,
    loadMore,
    manageAccess,
    retry: loadFirstPage,
  };
}
