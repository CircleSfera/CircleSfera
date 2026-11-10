import {
  GIF_OFFSET_MAX,
  GIF_PAGE_SIZE,
  GIF_QUERY_MAX_LENGTH,
} from '@circlesfera/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { type ChatGif, gifsApi } from '../../services/gifs.service';
import { Button, Dialog } from '../ui';

interface GifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onPick: (gif: ChatGif) => void;
}

// Picks a GIF to send: trending ones first, or those found by words, each at
// its own shape in columns. Pages come as the person asks for more, up to the
// furthest the server serves.
export function GifPicker({ isOpen, onClose, onPick }: GifPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const words = useDebouncedValue(query.trim(), 300);

  const gifs = useInfiniteQuery({
    queryKey: ['gifs', words],
    enabled: isOpen,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      (words
        ? await gifsApi.search(words, pageParam)
        : await gifsApi.trending(pageParam)
      ).data.data,
    getNextPageParam: (last, pages) => {
      const next = pages.length * GIF_PAGE_SIZE;
      return last.length === GIF_PAGE_SIZE &&
        next + GIF_PAGE_SIZE <= GIF_OFFSET_MAX
        ? next
        : undefined;
    },
  });
  const list = gifs.data?.pages.flat() ?? [];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      title={t('chat.gif_picker_title')}
    >
      <label className="relative block mb-3">
        <span className="sr-only">{t('chat.gif_search')}</span>
        <Search
          aria-hidden="true"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
        />
        <input
          type="search"
          value={query}
          maxLength={GIF_QUERY_MAX_LENGTH}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('chat.gif_search')}
          className="w-full min-h-12 rounded-xl bg-white/5 border border-white/10 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-brand-primary"
        />
      </label>

      <div className="max-h-[55vh] overflow-y-auto custom-scrollbar -mx-1 px-1">
        {gifs.isError ? (
          <p className="py-8 text-center text-sm text-white/60">
            {t('chat.gif_error')}
          </p>
        ) : !gifs.isLoading && list.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/60">
            {t('chat.gif_empty')}
          </p>
        ) : (
          <ul
            className="columns-2 sm:columns-3 gap-2"
            aria-label={t('chat.gif_picker_title')}
          >
            {list.map((gif) => (
              <li key={gif.id} className="mb-2 break-inside-avoid">
                <button
                  type="button"
                  onClick={() => onPick(gif)}
                  aria-label={gif.title || t('chat.gif_alt')}
                  className="block w-full overflow-hidden rounded-xl bg-white/5 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                >
                  <img
                    src={gif.url}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        {gifs.hasNextPage && (
          <div className="flex justify-center mt-3">
            <Button
              variant="outline"
              className="min-h-11 text-sm font-semibold px-4"
              isLoading={gifs.isFetchingNextPage}
              onClick={() => gifs.fetchNextPage()}
            >
              {t('chat.gif_load_more')}
            </Button>
          </div>
        )}
      </div>

      {/* GIPHY's terms ask for its name wherever its GIFs are picked. */}
      <p className="mt-3 text-xs text-white/50 text-right">
        {t('chat.gif_powered')}
      </p>
    </Dialog>
  );
}
