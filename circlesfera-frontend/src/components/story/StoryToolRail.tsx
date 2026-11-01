import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  MapPin,
  Music,
  PenTool,
  Smile,
  Sparkles,
  Type,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
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
  'countdown',
  'link',
  'music',
]);

/**
 * A soft shadow under each icon and name over the story, so they read on a
 * white or busy picture as well as on a dark one. It is on the icon and the
 * name, not on the button, so the hover disc stays clean.
 */
const SOFT_SHADOW =
  '*:[filter:drop-shadow(0_0_1px_rgba(0,0,0,0.6))_drop-shadow(0_1px_3px_rgba(0,0,0,0.5))_drop-shadow(0_0_10px_rgba(0,0,0,0.3))]';

/**
 * A tool over the story: a white icon with a soft shadow in a 44 px round
 * target, with its name beside it when the names are shown. The open tool is
 * a white disc, or a white pill with its name. On a phone the name is to the
 * left of the icon; on desktop, where the column stands right of the canvas,
 * to its right.
 */
const toolButton = (active: boolean, named: boolean) =>
  `relative min-w-11 h-11 inline-flex flex-row-reverse md:flex-row items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95 ${
    named ? 'pl-3 md:pl-0 md:pr-3' : ''
  } ${
    active
      ? 'bg-white text-black'
      : `text-white ${SOFT_SHADOW} hover:bg-white/10`
  }`;

function ToolFace({
  icon,
  label,
  named,
}: {
  icon: ReactNode;
  label: string;
  named: boolean;
}) {
  return (
    <>
      <span className="w-11 h-11 shrink-0 inline-flex items-center justify-center">
        {icon}
      </span>
      {named ? (
        <span
          className="whitespace-nowrap text-sm font-semibold"
          data-testid="story-tool-name"
        >
          {label}
        </span>
      ) : null}
    </>
  );
}

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
 * Icons only; each has its name for screen readers and as a tooltip, and the
 * chevron at the end of the column shows the names beside the icons and hides
 * them again.
 */
export default function StoryToolRail({
  activeTab,
  onSelectTab,
  share,
}: StoryToolRailProps) {
  const { t } = useTranslation();
  const [named, setNamed] = useState(false);

  return (
    <div
      className="flex flex-col items-end md:items-start gap-1"
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
            className={toolButton(isActive, named)}
            aria-label={label}
            title={named ? undefined : label}
            aria-pressed={isActive}
          >
            <ToolFace
              icon={
                <Icon size={20} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
              }
              label={label}
              named={named}
            />
          </button>
        );
      })}

      {share ? (
        <>
          <button
            type="button"
            onClick={share.onOpenMusic}
            className={toolButton(Boolean(share.musicTitle), named)}
            aria-label={t('createPost.story.add_music')}
            title={share.musicTitle ?? t('createPost.story.add_music')}
            aria-pressed={Boolean(share.musicTitle)}
          >
            <ToolFace
              icon={<Music size={20} strokeWidth={2} aria-hidden />}
              label={t('createPost.storyComposer.tool_music')}
              named={named}
            />
          </button>
          <button
            type="button"
            onClick={share.onOpenPlace}
            className={toolButton(Boolean(share.placeName), named)}
            aria-label={t('createPost.story.add_location')}
            title={share.placeName ?? t('createPost.story.add_location')}
            aria-pressed={Boolean(share.placeName)}
          >
            <ToolFace
              icon={<MapPin size={20} strokeWidth={2} aria-hidden />}
              label={t('createPost.storyComposer.tool_location')}
              named={named}
            />
          </button>
        </>
      ) : null}

      <button
        type="button"
        onClick={() => setNamed((v) => !v)}
        className={toolButton(false, false)}
        aria-label={t(
          named
            ? 'createPost.storyComposer.hide_tool_names'
            : 'createPost.storyComposer.show_tool_names',
        )}
        aria-expanded={named}
      >
        {named ? (
          <ChevronUp size={20} strokeWidth={2} aria-hidden />
        ) : (
          <ChevronDown size={20} strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}
