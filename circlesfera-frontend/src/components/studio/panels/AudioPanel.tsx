import { useQuery } from '@tanstack/react-query';
import { Music, Pause, Play, Plus, Search, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { audioApi } from '../../../services/audio.service';
import type { Audio } from '../../../types';
import { formatClock } from '../editor/EditorTimeline';

interface AudioPanelProps {
  onAddAudioFile: (file: File) => void;
  /** Puts a song of the library on the timeline. */
  onAddLibraryAudio: (audio: Audio) => void;
}

/** How long a search waits for the person to stop typing, in ms. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Sound for the video: a song of the library, the popular ones first or
 * found by name, heard before it is chosen, or a file from the device.
 */
export default function AudioPanel({
  onAddAudioFile,
  onAddLibraryAudio,
}: AudioPanelProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [query, setQuery] = useState('');
  const [hearing, setHearing] = useState<string | null>(null);
  const search = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['studio-audio', search],
    queryFn: () =>
      (search ? audioApi.search(search) : audioApi.getTrending()).then(
        (r) => r.data,
      ),
  });

  // A song heard before choosing stops when another is heard or the panel
  // closes.
  useEffect(
    () => () => {
      previewRef.current?.pause();
    },
    [],
  );

  const hear = (audio: Audio) => {
    previewRef.current?.pause();
    if (hearing === audio.id) {
      setHearing(null);
      return;
    }
    const el = new Audio(audio.url);
    // Only the song heard now changes the button: an older one, paused
    // while it loaded, rejects its play and must not.
    const done = () => {
      if (previewRef.current === el) setHearing(null);
    };
    el.onended = done;
    void el.play().catch(done);
    previewRef.current = el;
    setHearing(audio.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-48">
          <span className="sr-only">{t('studio.audio.search')}</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('studio.audio.search')}
            className="h-12 w-full rounded-full border border-white/10 bg-white/5 pl-9 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
          />
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10"
        >
          <Upload size={16} aria-hidden />
          {t('studio.audio.upload')}
        </button>
      </div>

      <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">
        {search ? t('studio.audio.results') : t('studio.audio.trending')}
      </h3>

      {isLoading && (
        <p className="text-sm text-white/50">{t('common.loading')}</p>
      )}
      {isError && (
        <p className="text-sm text-brand-secondary">
          {t('studio.audio.load_error')}
        </p>
      )}
      {!isLoading && !isError && (data ?? []).length === 0 && (
        <p className="text-sm text-white/50">{t('studio.audio.none')}</p>
      )}

      <ul className="flex flex-col gap-1">
        {(data ?? []).map((audio) => (
          <li key={audio.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => hear(audio)}
              aria-label={
                hearing === audio.id
                  ? t('studio.audio.stop', { title: audio.title })
                  : t('studio.audio.listen', { title: audio.title })
              }
              className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10 text-white"
            >
              {audio.thumbnailUrl ? (
                <img
                  src={audio.thumbnailUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-60"
                />
              ) : (
                <Music
                  size={16}
                  className="absolute text-white/30"
                  aria-hidden
                />
              )}
              {hearing === audio.id ? (
                <Pause size={16} className="relative" aria-hidden />
              ) : (
                <Play size={16} className="relative" aria-hidden />
              )}
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">
                {audio.title}
              </span>
              <span className="block truncate text-xs text-white/50">
                {audio.artist} · {formatClock(audio.duration)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                previewRef.current?.pause();
                setHearing(null);
                onAddLibraryAudio(audio);
              }}
              aria-label={t('studio.audio.use', { title: audio.title })}
              className="inline-flex min-h-11 items-center gap-1 rounded-full bg-white px-3 text-sm font-semibold text-black"
            >
              <Plus size={16} aria-hidden />
              {t('studio.audio.add')}
            </button>
          </li>
        ))}
      </ul>

      <input
        type="file"
        ref={fileRef}
        onChange={(e) => {
          if (e.target.files?.[0]) onAddAudioFile(e.target.files[0]);
          e.target.value = '';
        }}
        accept="audio/*"
        className="hidden"
      />
    </div>
  );
}
