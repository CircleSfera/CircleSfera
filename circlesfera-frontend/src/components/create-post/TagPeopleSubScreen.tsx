import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaFile, PostTagData } from '../../hooks/useCreatePost';
import { searchApi } from '../../services/search.service';
import type { Profile } from '../../types';
import { SUBSCREEN_SHELL } from './ComposerChrome';
import SubScreenHeader from './SubScreenHeader';

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
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const currentTags = tagsMap[currentIndex] || [];
  const currentMedia = mediaFiles[currentIndex];

  const handleImageTap = (e: React.MouseEvent<HTMLImageElement>) => {
    if (activeTap) {
      setActiveTap(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setActiveTap({ x, y });
    setSearchQuery('');
    setSearchResults([]);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const removeTag = (indexToRemove: number) => {
    setTagsMap((prev) => ({
      ...prev,
      [currentIndex]: prev[currentIndex].filter((_, i) => i !== indexToRemove),
    }));
  };

  React.useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        // API returns Profile[] (not { users: [] }) — same as NewChatModal / searchApi.
        const res = await searchApi.searchUsers(q);
        if (!cancelled) {
          setSearchResults(Array.isArray(res.data) ? res.data : []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(delayDebounceFn);
    };
  }, [searchQuery]);

  const selectUser = (user: Profile) => {
    if (!activeTap) return;
    setTagsMap((prev) => {
      const existing = prev[currentIndex] || [];
      if (existing.some((tag) => tag.profileId === user.id)) {
        return prev;
      }
      return {
        ...prev,
        [currentIndex]: [
          ...existing,
          {
            profileId: user.id,
            username: user.username,
            x: activeTap.x,
            y: activeTap.y,
          },
        ],
      };
    });
    setActiveTap(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div className={SUBSCREEN_SHELL}>
      <SubScreenHeader
        title={t('createPost.tags.title')}
        onClose={onClose}
        closeIcon="close"
        trailing={
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 h-9 rounded-full bg-linear-to-r from-brand-primary to-brand-blue text-white font-semibold text-xs shrink-0 shadow-md shadow-brand-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          >
            {t('createPost.tags.done')}
          </button>
        }
      />

      <div className="flex flex-col min-h-0 max-md:flex-1">
        <div className="relative bg-black flex items-center justify-center px-3 pt-2 pb-2 shrink-0">
          <div className="absolute top-2 left-0 right-0 z-10 flex justify-center pointer-events-none px-3">
            <span className="bg-black/55 backdrop-blur-md px-3 py-1 rounded-full text-white/85 text-[11px] font-medium">
              {t('createPost.tags.tap_photo')}
            </span>
          </div>

          {currentMedia && currentMedia.type === 'image' ? (
            <div className="relative inline-block max-w-full">
              {/* biome-ignore lint/a11y/noStaticElementInteractions: tagging needs click coordinates on the image */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: Map tagging requires mouse coordinates */}
              <img
                ref={imageRef}
                src={currentMedia.url}
                alt=""
                className="max-w-full max-h-[min(42vh,280px)] object-contain cursor-crosshair rounded-lg"
                onClick={handleImageTap}
                style={
                  currentMedia.filter
                    ? { filter: currentMedia.filter }
                    : undefined
                }
              />

              {/* Tap marker */}
              {activeTap && (
                <div
                  className="absolute w-3 h-3 rounded-full bg-brand-primary border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
                  style={{
                    left: `${activeTap.x * 100}%`,
                    top: `${activeTap.y * 100}%`,
                  }}
                />
              )}

              {currentTags.map((tag, idx) => (
                <div
                  key={`${tag.username}-${tag.x}-${tag.y}`}
                  className="absolute flex items-center gap-1.5 bg-black/80 backdrop-blur-md text-white text-[11px] font-bold px-2 py-1 rounded-md shadow-lg -translate-x-1/2 -translate-y-full -mt-1.5 cursor-pointer group border border-white/10"
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
                    aria-label={t('createPost.tags.remove')}
                  >
                    <X size={10} />
                  </button>
                  <div className="absolute left-1/2 -bottom-1.25 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-black/80" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-white/50 text-sm py-8">
              {t('createPost.tags.unsupported')}
            </div>
          )}
        </div>

        {/* Search docked below photo — avoids overflow clipping of floating popover */}
        <AnimatePresence>
          {activeTap && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="border-t border-white/8 bg-surface-elevated px-3 py-2.5 space-y-2 shrink-0"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-white/50">
                  {t('createPost.tags.search_user')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTap(null);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="text-[11px] text-white/40 hover:text-white min-h-8 px-2"
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={t('createPost.tags.search_user')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg h-10 py-2 pl-8 pr-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-brand-primary/50"
                  autoComplete="off"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-white/8 bg-white/2">
                {isSearching ? (
                  <div className="text-center text-[11px] text-white/40 py-3">
                    {t('createPost.tags.searching')}
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => selectUser(user)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                    >
                      <img
                        src={
                          user.avatar ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}`
                        }
                        className="w-7 h-7 rounded-full object-cover"
                        alt=""
                      />
                      <div className="min-w-0">
                        <span className="block text-[13px] text-white/90 font-medium truncate">
                          {user.username}
                        </span>
                        {user.fullName ? (
                          <span className="block text-[11px] text-white/40 truncate">
                            {user.fullName}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
                ) : searchQuery.trim().length >= 2 ? (
                  <div className="text-center text-[11px] text-white/40 py-3">
                    {t('createPost.tags.no_users')}
                  </div>
                ) : (
                  <div className="text-center text-[11px] text-white/40 py-3">
                    {t('createPost.tags.type_to_search')}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {mediaFiles.length > 1 && (
          <div className="px-3 py-2 flex gap-2 overflow-x-auto border-t border-white/8 no-scrollbar shrink-0">
            {mediaFiles.map((file, idx) => (
              <button
                type="button"
                key={file.url}
                onClick={() => {
                  setCurrentIndex(idx);
                  setActiveTap(null);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className={`w-11 h-11 rounded-lg overflow-hidden shrink-0 transition-all ${
                  currentIndex === idx
                    ? 'ring-2 ring-brand-primary ring-offset-1 ring-offset-surface-elevated'
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
        )}

        <div className="border-t border-white/8 px-3 py-2.5 space-y-2 max-md:flex-1 max-md:overflow-y-auto pb-3">
          <h3 className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
            {t('createPost.tags.tags_on_photo')}
          </h3>
          {currentTags.length === 0 ? (
            <p className="text-[12px] text-white/35 leading-snug">
              {t('createPost.tags.no_tags_yet')}
            </p>
          ) : (
            <div className="space-y-1.5">
              {currentTags.map((tag, idx) => (
                <div
                  key={`${tag.username}-${tag.x}-${tag.y}`}
                  className="flex items-center justify-between bg-white/5 rounded-lg px-2.5 py-2 border border-white/6"
                >
                  <span className="text-[13px] font-semibold text-white/90">
                    @{tag.username}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeTag(idx)}
                    className="min-h-8 min-w-8 flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-white/8 transition-colors"
                    aria-label={t('createPost.tags.remove')}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
