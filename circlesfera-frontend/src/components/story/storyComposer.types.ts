import type { LucideIcon } from 'lucide-react';

export type StoryComposerTab =
  | 'none'
  | 'text'
  | 'stickers'
  | 'background'
  | 'templates'
  | 'poll'
  | 'qna'
  | 'draw';

export type PanelTab = 'style' | 'transform' | 'layers';

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
