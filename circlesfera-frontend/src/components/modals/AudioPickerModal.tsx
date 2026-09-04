import { useQuery } from '@tanstack/react-query';
import { Check, Music, Pause, Play, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { audioApi } from '../../services/audio.service';
import type { Audio } from '../../types';
import { Dialog } from '../ui/Dialog';

interface AudioPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAudio: (audio: Audio | null) => void;
  selectedAudioId?: string | null;
}

export default function AudioPickerModal({
  isOpen,
  onClose,
  onSelectAudio,
  selectedAudioId,
}: AudioPickerModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  const { data: trendingAudios, isLoading: isLoadingTrending } = useQuery({
    queryKey: ['audio', 'trending'],
    queryFn: async () => {
      const res = await audioApi.getTrending();
      return res.data;
    },
    enabled: isOpen && !searchQuery,
  });

  const { data: searchAudios, isLoading: isLoadingSearch } = useQuery({
    queryKey: ['audio', 'search', searchQuery],
    queryFn: async () => {
      const res = await audioApi.search(searchQuery);
      return res.data;
    },
    enabled: isOpen && searchQuery.trim().length > 0,
  });

  useEffect(() => {
    if (isOpen) return;
    setSearchQuery('');
    setPlayingAudioId(null);
    setAudioElement((prev) => {
      prev?.pause();
      return null;
    });
  }, [isOpen]);

  const audioList =
    searchQuery.trim().length > 0 ? searchAudios || [] : trendingAudios || [];

  const handleTogglePreview = (audio: Audio) => {
    if (playingAudioId === audio.id) {
      audioElement?.pause();
      setPlayingAudioId(null);
      setAudioElement(null);
    } else {
      audioElement?.pause();
      const newAudio = new window.Audio(audio.url);
      newAudio.play().catch(() => {});
      setPlayingAudioId(audio.id);
      setAudioElement(newAudio);
      newAudio.onended = () => setPlayingAudioId(null);
    }
  };

  const handleSelect = (audio: Audio) => {
    audioElement?.pause();
    setPlayingAudioId(null);
    onSelectAudio(audio);
    onClose();
  };

  const handleClearSelection = () => {
    audioElement?.pause();
    setPlayingAudioId(null);
    onSelectAudio(null);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      className="max-h-[90vh]"
    >
      <div className="-mx-4 -mt-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0 pr-14">
          <Music className="w-5 h-5 text-brand-primary" aria-hidden />
          <h3 className="text-lg font-bold text-white">
            {t('modals.audio.title')}
          </h3>
        </div>

        <div className="flex flex-col flex-1 min-h-0 p-4">
          <div className="relative mb-4 shrink-0">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('modals.audio.search_placeholder')}
              className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl pl-9 pr-4 py-2.5 min-h-11 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-brand-primary transition"
            />
          </div>

          {selectedAudioId && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="mb-3 px-3 py-2 min-h-11 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl flex items-center justify-between transition shrink-0"
            >
              <span>{t('modals.audio.clear_selection')}</span>
            </button>
          )}

          <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar min-h-0">
            {isLoadingTrending || isLoadingSearch ? (
              <div className="py-12 text-center text-sm text-neutral-400">
                {t('modals.audio.loading')}
              </div>
            ) : audioList.length === 0 ? (
              <div className="py-12 text-center text-sm text-neutral-400">
                {searchQuery
                  ? t('modals.audio.no_results')
                  : t('modals.audio.empty')}
              </div>
            ) : (
              audioList.map((audio) => {
                const isSelected = selectedAudioId === audio.id;
                const isPlaying = playingAudioId === audio.id;

                return (
                  <div
                    key={audio.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition ${
                      isSelected
                        ? 'bg-brand-primary/10 border-brand-primary/40'
                        : 'bg-neutral-800/40 border-neutral-800 hover:bg-neutral-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleTogglePreview(audio)}
                        aria-label={
                          isPlaying
                            ? t('modals.audio.pause_preview')
                            : t('modals.audio.play_preview')
                        }
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition ${
                          isPlaying
                            ? 'bg-brand-primary text-black'
                            : 'bg-neutral-800 text-white hover:bg-neutral-700'
                        }`}
                      >
                        {isPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {audio.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate">
                          {audio.artist || t('modals.audio.unknown_artist')}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelect(audio)}
                      className={`px-3 py-1.5 min-h-11 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                        isSelected
                          ? 'bg-brand-primary text-black'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3.5 h-3.5" aria-hidden />
                          {t('modals.audio.selected')}
                        </>
                      ) : (
                        t('modals.audio.use')
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
