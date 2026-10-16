import { motion } from 'framer-motion';
import {
  AtSign,
  BadgeCheck,
  BarChart2,
  Hash,
  HelpCircle,
  Link,
  type LucideIcon,
  MapPin,
  Music,
  Search,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  STICKER_CATEGORIES,
  STORY_STICKER_MAX,
} from '../storyComposer.constants';
import type { StoryComposerTab } from '../storyComposer.types';

/** The interactive stickers, first in the tray, as on Instagram. */
const INTERACTIVE: {
  tab: StoryComposerTab;
  icon: LucideIcon;
  labelKey: string;
}[] = [
  { tab: 'poll', icon: BarChart2, labelKey: 'tool_poll' },
  { tab: 'qna', icon: HelpCircle, labelKey: 'tool_qna' },
  { tab: 'quiz', icon: BadgeCheck, labelKey: 'tool_quiz' },
  { tab: 'slider', icon: SlidersHorizontal, labelKey: 'tool_slider' },
  { tab: 'countdown', icon: Timer, labelKey: 'tool_countdown' },
  { tab: 'hashtag', icon: Hash, labelKey: 'tool_hashtag' },
  { tab: 'mention', icon: AtSign, labelKey: 'tool_mention' },
  { tab: 'location', icon: MapPin, labelKey: 'tool_location' },
  { tab: 'link', icon: Link, labelKey: 'tool_link' },
  { tab: 'music', icon: Music, labelKey: 'tool_music' },
];

export interface StoryStickersPanelProps {
  activeStickerCategory: number;
  onActiveStickerCategoryChange: (index: number) => void;
  onAddSticker: (sticker: string) => void;
  /** Opens the setup of an interactive sticker. */
  onOpenSticker: (tab: StoryComposerTab) => void;
  /** The story can carry a place: the editor shares it itself. */
  canPlace?: boolean;
  /** The story can carry a song: the editor shares it itself. */
  canMusic?: boolean;
  /** The story already holds as many interactive stickers as it may. */
  full?: boolean;
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * The sticker tray: a search field, the interactive stickers (poll,
 * questions, quiz, slider, hashtag, mention and, when the editor shares the
 * story, location), then the emoji by category.
 */
export default function StoryStickersPanel({
  activeStickerCategory,
  onActiveStickerCategoryChange,
  onAddSticker,
  onOpenSticker,
  canPlace = false,
  canMusic = false,
  full = false,
}: StoryStickersPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const q = fold(query.trim());
  const interactive = INTERACTIVE.filter(
    ({ tab, labelKey }) =>
      (canPlace || tab !== 'location') &&
      (canMusic || tab !== 'music') &&
      (!q || fold(t(`createPost.storyComposer.${labelKey}`)).includes(q)),
  );
  const categoryName = (label: string) =>
    t(`createPost.storyComposer.sticker_categories.${label.toLowerCase()}`, {
      defaultValue: label,
    });
  // Searching shows the categories whose name matches, all their emoji.
  const matchingCategories = q
    ? STICKER_CATEGORIES.filter((cat) =>
        fold(categoryName(cat.label)).includes(q),
      )
    : [];

  return (
    <motion.div
      key="stickers-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
      className="px-3 space-y-3"
    >
      <label className="flex items-center gap-2 min-h-12 px-4 rounded-2xl bg-white/6 border border-white/10 focus-within:border-brand-primary/40">
        <Search size={16} className="shrink-0 text-white/50" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('createPost.storyComposer.stickers_search')}
          aria-label={t('createPost.storyComposer.stickers_search')}
          className="flex-1 min-w-0 min-h-12 bg-transparent text-base text-white outline-none placeholder:text-white/40"
        />
      </label>

      {interactive.length > 0 ? (
        <section
          aria-label={t('createPost.storyComposer.stickers_interactive')}
        >
          {full ? (
            <p className="text-sm text-white/60 text-center pb-2">
              {t('createPost.storyComposer.stickers_limit', {
                max: STORY_STICKER_MAX,
              })}
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            {interactive.map(({ tab, icon: Icon, labelKey }) => (
              <button
                type="button"
                key={tab}
                onClick={() => onOpenSticker(tab)}
                disabled={full}
                className="disabled:opacity-40 min-h-12 px-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white text-black text-sm font-bold shadow-[0_4px_12px_rgba(0,0,0,0.3)] active:scale-95"
              >
                <Icon
                  size={16}
                  className="shrink-0 text-brand-primary"
                  aria-hidden
                />
                <span className="truncate">
                  {t(`createPost.storyComposer.${labelKey}`)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {q ? (
        matchingCategories.length === 0 && interactive.length === 0 ? (
          <p className="text-sm text-white/60 text-center py-4">
            {t('createPost.storyComposer.stickers_no_results')}
          </p>
        ) : (
          matchingCategories.map((cat) => (
            <EmojiGrid key={cat.label} items={cat.items} onAdd={onAddSticker} />
          ))
        )
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {STICKER_CATEGORIES.map((cat, idx) => (
              <button
                type="button"
                key={cat.label}
                onClick={() => onActiveStickerCategoryChange(idx)}
                className={`min-h-11 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  activeStickerCategory === idx
                    ? 'bg-white text-black'
                    : 'text-white/60 hover:text-white/80 bg-white/5 border border-white/8'
                }`}
              >
                {categoryName(cat.label)}
              </button>
            ))}
          </div>
          <EmojiGrid
            items={STICKER_CATEGORIES[activeStickerCategory].items}
            onAdd={onAddSticker}
          />
        </>
      )}
    </motion.div>
  );
}

function EmojiGrid({
  items,
  onAdd,
}: {
  items: readonly string[];
  onAdd: (sticker: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 pb-0.5">
      {items.map((s) => (
        <motion.button
          type="button"
          key={s}
          onClick={() => onAdd(s)}
          className="text-2xl min-h-12 min-w-12 p-2 rounded-xl hover:bg-white/8 active:bg-white/12 transition-colors flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.9 }}
        >
          {s}
        </motion.button>
      ))}
    </div>
  );
}
