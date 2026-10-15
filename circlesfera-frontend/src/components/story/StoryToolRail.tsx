import {
  BarChart2,
  Ellipsis,
  HelpCircle,
  Image as ImageIcon,
  MapPin,
  Music,
  PenTool,
  Smile,
  Sparkles,
  Type,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryComposerTab } from './storyComposer.types';
import type { StoryShareOptions } from './storyShare.types';

const PRIMARY: {
  tab: Exclude<StoryComposerTab, 'none' | 'poll' | 'qna'>;
  icon: typeof Type;
  labelKey: string;
}[] = [
  { tab: 'text', icon: Type, labelKey: 'text' },
  { tab: 'stickers', icon: Smile, labelKey: 'stickers' },
  { tab: 'draw', icon: PenTool, labelKey: 'draw' },
  { tab: 'background', icon: ImageIcon, labelKey: 'background' },
  { tab: 'templates', icon: Sparkles, labelKey: 'templates' },
];

const MORE_TOOLS: {
  tab: 'poll' | 'qna';
  icon: typeof BarChart2;
  labelKey: string;
}[] = [
  { tab: 'poll', icon: BarChart2, labelKey: 'poll' },
  { tab: 'qna', icon: HelpCircle, labelKey: 'qna' },
];

/**
 * A tool over the story: a white icon with a shadow, readable on any
 * picture, in a 44 px round target; the open tool is a white disc.
 */
const toolButton = (active: boolean) =>
  `relative w-11 h-11 inline-flex items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95 ${
    active
      ? 'bg-white text-black'
      : 'text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.65))] hover:bg-white/10'
  }`;

interface StoryToolRailProps {
  activeTab: StoryComposerTab;
  onSelectTab: (tab: StoryComposerTab) => void;
  /** Music and place of the story, when the editor shares it itself. */
  share?: StoryShareOptions;
}

/**
 * The tools of the story editor, as a column at the right of the canvas:
 * text, stickers, draw, background, templates, and more (poll, questions).
 * Icons only; each has its name for screen readers and as a tooltip.
 */
export default function StoryToolRail({
  activeTab,
  onSelectTab,
  share,
}: StoryToolRailProps) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreToolActive = activeTab === 'poll' || activeTab === 'qna';

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [moreOpen]);

  return (
    <div
      className="flex flex-col items-center gap-1"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('createPost.storyComposer.tools')}
    >
      {PRIMARY.map(({ tab, icon: Icon, labelKey }) => {
        const isActive = activeTab === tab;
        const label = t(`createPost.storyComposer.tool_${labelKey}`);
        return (
          <button
            type="button"
            key={tab}
            onClick={() => {
              setMoreOpen(false);
              onSelectTab(isActive ? 'none' : tab);
            }}
            className={toolButton(isActive)}
            aria-label={label}
            title={label}
            aria-pressed={isActive}
          >
            <Icon size={20} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
          </button>
        );
      })}

      {share ? (
        <>
          <button
            type="button"
            onClick={share.onOpenMusic}
            className={toolButton(Boolean(share.musicTitle))}
            aria-label={t('createPost.story.add_music')}
            title={share.musicTitle ?? t('createPost.story.add_music')}
            aria-pressed={Boolean(share.musicTitle)}
          >
            <Music size={20} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={share.onOpenPlace}
            className={toolButton(Boolean(share.placeName))}
            aria-label={t('createPost.story.add_location')}
            title={share.placeName ?? t('createPost.story.add_location')}
            aria-pressed={Boolean(share.placeName)}
          >
            <MapPin size={20} strokeWidth={2} aria-hidden />
          </button>
        </>
      ) : null}

      <div className="relative" ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={toolButton(moreToolActive || moreOpen)}
          aria-label={t('createPost.storyComposer.tool_more')}
          title={t('createPost.storyComposer.tool_more')}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
        >
          <Ellipsis size={20} strokeWidth={2} aria-hidden />
        </button>

        {moreOpen && (
          <div
            role="menu"
            className="absolute top-0 right-full mr-2 w-52 rounded-2xl border border-white/12 bg-surface-high shadow-[0_12px_40px_rgba(0,0,0,0.55)] overflow-hidden z-50"
          >
            <p className="px-3.5 pt-3 pb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white/50">
              {t('createPost.storyComposer.more_section')}
            </p>
            {MORE_TOOLS.map(({ tab, icon: Icon, labelKey }) => {
              const selected = activeTab === tab;
              return (
                <button
                  type="button"
                  role="menuitem"
                  key={tab}
                  onClick={() => {
                    onSelectTab(selected ? 'none' : tab);
                    setMoreOpen(false);
                  }}
                  className={`w-full min-h-12 px-3.5 flex items-center gap-3 text-left text-sm font-semibold transition-colors outline-none focus-visible:bg-white/10 ${
                    selected
                      ? 'bg-brand-primary/15 text-white'
                      : 'text-white/80 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                      selected
                        ? 'border-brand-primary/40 bg-brand-primary/20 text-brand-primary-text'
                        : 'border-white/8 bg-white/5 text-white/70'
                    }`}
                  >
                    <Icon size={18} aria-hidden />
                  </span>
                  {t(`createPost.storyComposer.tool_${labelKey}`)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
