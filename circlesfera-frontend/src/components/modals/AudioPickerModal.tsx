import { useQuery } from '@tanstack/react-query';
import { Check, Music, Pause, Play, Search, X } from 'lucide-react';
import { useState } from 'react';
import { audioApi } from '../../services/audio.service';
import type { Audio } from '../../types';

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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-white">Seleccionar Música</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative my-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por canción o artista..."
            className="w-full bg-neutral-800/80 border border-neutral-700/60 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary transition"
          />
        </div>

        {/* Remove Audio Option if selected */}
        {selectedAudioId && (
          <button
            type="button"
            onClick={handleClearSelection}
            className="mb-3 px-3 py-2 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl flex items-center justify-between transition"
          >
            <span>Quitar música seleccionada</span>
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Audio List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-neutral-800">
          {isLoadingTrending || isLoadingSearch ? (
            <div className="py-12 text-center text-sm text-neutral-400">
              Cargando pistas de audio...
            </div>
          ) : audioList.length === 0 ? (
            <div className="py-12 text-center text-sm text-neutral-400">
              {searchQuery
                ? 'No se encontraron resultados.'
                : 'No hay audios disponibles.'}
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
                      ? 'bg-primary/10 border-primary/40'
                      : 'bg-neutral-800/40 border-neutral-800 hover:bg-neutral-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleTogglePreview(audio)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition ${
                        isPlaying
                          ? 'bg-primary text-black'
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
                        {audio.artist || 'Artista Desconocido'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelect(audio)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                      isSelected
                        ? 'bg-primary text-black'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Seleccionado
                      </>
                    ) : (
                      'Usar'
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
