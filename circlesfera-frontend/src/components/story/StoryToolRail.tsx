import {
  BarChart2,
  Ellipsis,
  HelpCircle,
  Image as ImageIcon,
  PenTool,
  Smile,
  Sparkles,
  Type,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryComposerTab } from './storyComposer.types';

const PRIMARY: {
  tab: Exclude<StoryComposerTab, 'none' | 'poll' | 'qna'>;
  icon: typeof Type;
  labelKey: string;
}[] = [
  { tab: 'background', icon: ImageIcon, labelKey: 'background' },
  { tab: 'text', icon: Type, labelKey: 'text' },
  { tab: 'stickers', icon: Smile, labelKey: 'stickers' },
  { tab: 'templates', icon: Sparkles, labelKey: 'templates' },
  { tab: 'draw', icon: PenTool, labelKey: 'draw' },
];

const MORE_TOOLS: {
  tab: 'poll' | 'qna';
  icon: typeof BarChart2;
  labelKey: string;
}[] = [
  { tab: 'poll', icon: BarChart2, labelKey: 'poll' },
  { tab: 'qna', icon: HelpCircle, labelKey: 'qna' },
];

interface StoryToolRailProps {
  activeTab: StoryComposerTab;
  onSelectTab: (tab: StoryComposerTab) => void;
}

/**
 * Thumb-zone tool rail (ADR-0018): icon-first, progressive disclosure for Poll/Q&A.
 * Active = soft fill + brand tick — not a heavy white pill that fights the canvas.
 */
export default function StoryToolRail({
  activeTab,
  onSelectTab,
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
      className="shrink-0 z-40 px-1.5 pt-1 pb-1"
      role="toolbar"
      aria-label={t('createPost.storyComposer.tools')}
    >
      <div className="flex items-stretch justify-between gap-0.5 max-w-md mx-auto relative">
        {PRIMARY.map(({ tab, icon: Icon, labelKey }) => {
          const isActive = activeTab === tab;
          return (
            <button
              type="button"
              key={tab}
              onClick={() => {
                setMoreOpen(false);
                onSelectTab(isActive ? 'none' : tab);
              }}
              className={`relative flex-1 min-h-12 min-w-0 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                isActive
                  ? 'bg-white/12 text-white'
                  : 'text-white/55 hover:bg-white/6 hover:text-white/90'
              }`}
              aria-label={t(`createPost.storyComposer.tool_${labelKey}`)}
              aria-pressed={isActive}
            >
              <Icon size={22} strokeWidth={isActive ? 2.25 : 1.85} />
              <span
                className={`text-[10px] font-semibold tracking-wide leading-none truncate max-w-full px-0.5 ${
                  isActive ? 'text-white/90' : 'text-white/45'
                }`}
              >
                {t(`createPost.storyComposer.tool_${labelKey}`)}
              </span>
              {isActive && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-brand-primary"
                  aria-hidden
                />
              )}
            </button>
          );
        })}

        <div className="relative shrink-0 w-12" ref={moreRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={`relative w-full min-h-12 flex flex-col items-center justify-center gap-1 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
              moreToolActive
                ? 'bg-white/12 text-white'
                : moreOpen
                  ? 'bg-white/8 text-white/90'
                  : 'text-white/55 hover:bg-white/6 hover:text-white/90'
            }`}
            aria-label={t('createPost.storyComposer.tool_more')}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
          >
            <Ellipsis size={22} strokeWidth={moreToolActive ? 2.25 : 1.85} />
            <span
              className={`text-[10px] font-semibold tracking-wide leading-none ${
                moreToolActive || moreOpen ? 'text-white/90' : 'text-white/45'
              }`}
            >
              {t('createPost.storyComposer.tool_more')}
            </span>
            {moreToolActive && (
              <span
                className="absolute bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-brand-primary"
                aria-hidden
              />
            )}
          </button>

          {moreOpen && (
            <div
              role="menu"
              className="absolute bottom-full right-0 mb-2.5 w-52 rounded-2xl border border-white/12 bg-zinc-900/98 shadow-[0_12px_40px_rgba(0,0,0,0.55)] overflow-hidden z-50 backdrop-blur-xl"
            >
              <p className="px-3.5 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
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
                        : 'text-white/75 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                        selected
                          ? 'border-brand-primary/40 bg-brand-primary/20 text-brand-primary'
                          : 'border-white/8 bg-white/5 text-white/70'
                      }`}
                    >
                      <Icon size={18} />
                    </span>
                    {t(`createPost.storyComposer.tool_${labelKey}`)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
