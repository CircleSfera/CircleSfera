import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaFile, PostTagData } from '../../hooks/useCreatePost';
import { apiClient } from '../../services/api';

interface TagPeopleSubScreenProps {
  mediaFiles: MediaFile[];
  tagsMap: Record<number, PostTagData[]>;
  setTagsMap: React.Dispatch<
    React.SetStateAction<Record<number, PostTagData[]>>
  >;
  onClose: () => void;
}

export default function TagPeopleSubScreen({
  mediaFiles,
  tagsMap,
  setTagsMap,
  onClose,
}: TagPeopleSubScreenProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTap, setActiveTap] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const currentTags = tagsMap[currentIndex] || [];
  const currentMedia = mediaFiles[currentIndex];

  const handleImageTap = (e: React.MouseEvent<HTMLImageElement>) => {
    if (activeTap) {
      setActiveTap(null); // Dismiss if already active
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setActiveTap({ x, y });
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeTag = (indexToRemove: number) => {
    setTagsMap((prev) => ({
      ...prev,
      [currentIndex]: prev[currentIndex].filter((_, i) => i !== indexToRemove),
    }));
  };

  // Search effect
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiClient.get('/search/users', {
          params: { q: searchQuery },
        });
        setSearchResults(res.data.users || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const selectUser = (user: any) => {
    if (!activeTap) return;
    setTagsMap((prev) => {
      const existing = prev[currentIndex] || [];
      return {
        ...prev,
        [currentIndex]: [
          ...existing,
          {
            userId: user.id,
            username: user.profile.username,
            x: activeTap.x,
            y: activeTap.y,
          },
        ],
      };
    });
    setActiveTap(null);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="w-full h-full flex flex-col md:flex-row bg-black relative"
      >
        {/* Left Side: Image Preview */}
        <div className="flex-1 bg-black relative flex flex-col justify-center items-center overflow-hidden border-b md:border-b-0 md:border-r border-white/10">
          <div className="absolute top-4 left-4 z-20 md:hidden">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-4 text-center absolute top-4 z-10 w-full pointer-events-none">
            <span className="bg-black/50 backdrop-blur-md px-4 py-1.5 rounded-full text-white/90 text-sm font-medium">
              {t('createPost.tags.tap_photo')}
            </span>
          </div>

          {currentMedia && currentMedia.type === 'image' ? (
            <div className="relative inline-block max-w-full max-h-full">
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: Map tagging requires mouse coordinates */}
              <img
                ref={imageRef}
                src={currentMedia.url}
                alt="Tag"
                className="max-w-full max-h-[70vh] md:max-h-full object-contain cursor-crosshair"
                onClick={handleImageTap}
                style={
                  currentMedia.filter
                    ? { filter: currentMedia.filter }
                    : undefined
                }
              />

              {/* Existing Tags */}
              {currentTags.map((tag, idx) => (
                <div
                  key={`${tag.username}-${tag.x}-${tag.y}`}
                  className="absolute flex items-center gap-2 bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg -translate-x-1/2 -translate-y-full mt-[-8px] cursor-pointer group border border-white/10 transition-all hover:bg-black/90 hover:scale-105"
                  style={{ left: `${tag.x * 100}%`, top: `${tag.y * 100}%` }}
                >
                  {tag.username}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(idx);
                    }}
                    className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                  {/* Triangle pointer */}
                  <div className="absolute left-1/2 -bottom-[5px] -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-black/80"></div>
                </div>
              ))}

              {/* Active Tap / Search Popover */}
              <AnimatePresence>
                {activeTap && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="absolute z-30 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl w-64 -translate-x-1/2"
                    style={{
                      left: `${activeTap.x * 100}%`,
                      top: `${activeTap.y * 100}%`,
                      marginTop: activeTap.y > 0.5 ? '-180px' : '10px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-3 border-b border-white/10 relative">
                      <Search
                        size={14}
                        className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40"
                      />
                      <input
                        type="text"
                        placeholder={t('createPost.tags.search_user')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto p-2">
                      {isSearching ? (
                        <div className="text-center text-xs text-white/40 py-4">
                          {t('createPost.tags.searching')}
                        </div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map((user) => (
                          <button
                            type="button"
                            key={user.id}
                            onClick={() => selectUser(user)}
                            className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors text-left"
                          >
                            <img
                              src={
                                user.profile.avatar ||
                                `https://ui-avatars.com/api/?name=${user.profile.username}`
                              }
                              className="w-6 h-6 rounded-full"
                              alt=""
                            />
                            <span className="text-sm text-white/90 font-medium">
                              {user.profile.username}
                            </span>
                          </button>
                        ))
                      ) : searchQuery ? (
                        <div className="text-center text-xs text-white/40 py-4">
                          {t('createPost.tags.no_users')}
                        </div>
                      ) : (
                        <div className="text-center text-xs text-white/40 py-4">
                          {t('createPost.tags.type_to_search')}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-white/50 text-sm">
              {t('createPost.tags.unsupported')}
            </div>
          )}
        </div>

        {/* Right Side: Navigation & List */}
        <div className="w-full md:w-80 flex flex-col bg-black shrink-0">
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-14 bg-black border-b border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-2 text-white/90 hover:text-white transition-colors"
            >
              <X size={24} strokeWidth={2} />
            </button>
            <h2 className="font-bold text-[15px] tracking-tight text-white">
              {t('createPost.tags.title')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-brand-primary font-bold text-sm transition-colors"
            >
              {t('createPost.tags.done', 'Done')}
            </button>
          </div>

          <div className="p-4 flex gap-2 overflow-x-auto border-b border-white/5 no-scrollbar">
            {mediaFiles.map((file, idx) => (
              <button
                type="button"
                key={file.url}
                onClick={() => setCurrentIndex(idx)}
                className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 transition-all ${
                  currentIndex === idx
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-neutral-900'
                    : 'opacity-50 hover:opacity-100'
                }`}
              >
                {file.type === 'video' ? (
                  <video src={file.url} className="w-full h-full object-cover">
                    <track kind="captions" />
                  </video>
                ) : (
                  <img
                    src={file.url}
                    className="w-full h-full object-cover"
                    alt=""
                    style={file.filter ? { filter: file.filter } : undefined}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-4">
              {t('createPost.tags.tags_on_photo')}
            </h3>
            {currentTags.length === 0 && (
              <div className="text-sm text-white/30 text-center mt-8">
                {t('createPost.tags.no_tags_yet')}
              </div>
            )}
            {currentTags.map((tag, idx) => (
              <div
                key={`${tag.username}-${tag.x}-${tag.y}`}
                className="flex items-center justify-between bg-white/5 rounded-xl p-3 border border-white/5"
              >
                <span className="text-sm font-semibold text-white/90">
                  @{tag.username}
                </span>
                <button
                  type="button"
                  onClick={() => removeTag(idx)}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-red-400 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
