import { useQuery } from '@tanstack/react-query';
import { Check, Music, Pause, Play, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { audioApi } from '../services';
import type { Audio } from '../types';
import { logger } from '../utils/logger';

interface MusicPickerProps {
  onSelect: (audio: Audio) => void;
  onClose: () => void;
}

export default function MusicPicker({ onSelect, onClose }: MusicPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  const { data: trendingMusic, isLoading: isLoadingTrending } = useQuery({
    queryKey: ['music', 'trending'],
    queryFn: async () => {
      const res = await audioApi.getTrending();
      return res.data;
    },
  });

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['music', 'search', searchQuery],
    queryFn: async () => {
      if (!searchQuery) return [];
      const res = await audioApi.search(searchQuery);
      return res.data;
    },
    enabled: searchQuery.length > 0,
  });

  const tracks = searchQuery ? searchResults : trendingMusic;
  const isLoading = searchQuery ? isSearching : isLoadingTrending;

  const togglePlay = (track: Audio) => {
    if (playingId === track.id) {
      audioElement?.pause();
      setPlayingId(null);
    } else {
      audioElement?.pause();
      const newAudio = new window.Audio(track.url);
      newAudio.play().catch((err) => logger.error('Error playing audio', err));
      setAudioElement(newAudio);
      setPlayingId(track.id);

      newAudio.addEventListener('ended', () => {
        setPlayingId(null);
      });
    }
  };

  useEffect(() => {
    return () => {
      audioElement?.pause();
    };
  }, [audioElement]);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-white/10 w-full max-w-md rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
          <h3 className="text-lg font-bold">Añadir música</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4">
          <div className="relative group">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-400 transition-colors"
              size={18}
            />
            <input
              type="text"
              placeholder="Buscar música o artistas..."
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm text-white placeholder-zinc-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Tracks List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin scrollbar-thumb-white/10">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400">Cargando pistas...</p>
            </div>
          ) : tracks && tracks.length > 0 ? (
            <div className="space-y-1">
              {!searchQuery && (
                <p className="px-2 py-1 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Tendencias
                </p>
              )}
              {tracks.map((track: Audio) => (
                <button
                  key={track.id}
                  type="button"
                  className="w-full text-left group flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/5"
                  onClick={() => onSelect(track)}
                >
                  {/* Thumbnail / Icon */}
                  <div className="relative w-12 h-12 shrink-0">
                    {track.thumbnailUrl ? (
                      <img
                        src={track.thumbnailUrl}
                        alt={track.title}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5 rounded-lg flex items-center justify-center">
                        <Music className="text-zinc-400" size={20} />
                      </div>
                    )}
                    {/* biome-ignore lint/a11y/useSemanticElements: Nested interaction */}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay(track);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          togglePlay(track);
                        }
                      }}
                      className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity rounded-lg ${playingId === track.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      aria-label={playingId === track.id ? 'Pause' : 'Play'}
                    >
                      {playingId === track.id ? (
                        <Pause fill="white" size={16} />
                      ) : (
                        <Play fill="white" size={16} />
                      )}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate text-zinc-100">
                      {track.title}
                    </h4>
                    <p className="text-xs text-zinc-400 truncate">
                      {track.artist}
                    </p>
                  </div>

                  {/* Select button */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <Check size={16} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Music className="text-zinc-700 mb-3" size={40} />
              <p className="text-zinc-400 text-sm">No se encontraron pistas</p>
              <p className="text-zinc-600 text-xs mt-1">
                Prueba con palabras clave diferentes
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
