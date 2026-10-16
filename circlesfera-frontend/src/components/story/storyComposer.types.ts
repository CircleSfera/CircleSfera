import type { LucideIcon } from 'lucide-react';

export type StoryComposerTab =
  | 'none'
  | 'text'
  | 'stickers'
  | 'background'
  | 'templates'
  | 'poll'
  | 'qna'
  | 'quiz'
  | 'slider'
  | 'hashtag'
  | 'mention'
  | 'location'
  | 'countdown'
  | 'link'
  | 'music'
  | 'draw';

export type PanelTab = 'style' | 'transform' | 'layers';

/** The brushes of the drawing tool. */
export type StoryBrush = 'pen' | 'marker' | 'neon' | 'eraser';

export type StoryFontOption = {
  name: string;
  label: string;
  style: string;
};

export type StoryToolDef = {
  tab: Exclude<StoryComposerTab, 'none'>;
  icon: LucideIcon;
  labelKey: string;
};
