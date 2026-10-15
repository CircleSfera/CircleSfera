import {
  Image as ImageIcon,
  MapPin,
  Music,
  PenTool,
  Smile,
  Sparkles,
  Type,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StoryComposerTab } from './storyComposer.types';
import type { StoryShareOptions } from './storyShare.types';

const PRIMARY: {
  tab: 'text' | 'stickers' | 'draw' | 'background' | 'templates';
  icon: typeof Type;
  labelKey: string;
}[] = [
  { tab: 'text', icon: Type, labelKey: 'text' },
  { tab: 'stickers', icon: Smile, labelKey: 'stickers' },
  { tab: 'draw', icon: PenTool, labelKey: 'draw' },
  { tab: 'background', icon: ImageIcon, labelKey: 'background' },
  { tab: 'templates', icon: Sparkles, labelKey: 'templates' },
];

/** The setups of the stickers of the tray, under the stickers tool. */
const STICKER_SETUPS: ReadonlySet<StoryComposerTab> = new Set([
  'poll',
  'qna',
  'quiz',
  'slider',
  'hashtag',
  'mention',
  'location',
]);

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
 * text, stickers (polls, questions and the rest are in their tray), draw,
 * background, templates, and music and place when the editor shares.
 * Icons only; each has its name for screen readers and as a tooltip.
 */
export default function StoryToolRail({
  activeTab,
  onSelectTab,
  share,
}: StoryToolRailProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-col items-center gap-1"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t('createPost.storyComposer.tools')}
    >
      {PRIMARY.map(({ tab, icon: Icon, labelKey }) => {
        const isActive =
          activeTab === tab ||
          (tab === 'stickers' && STICKER_SETUPS.has(activeTab));
        const label = t(`createPost.storyComposer.tool_${labelKey}`);
        return (
          <button
            type="button"
            key={tab}
            onClick={() => onSelectTab(isActive ? 'none' : tab)}
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
    </div>
  );
}
