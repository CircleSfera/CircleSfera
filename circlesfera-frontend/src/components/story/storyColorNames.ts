import type { TFunction } from 'i18next';

// The colours the story composer offers, by the name a screen reader says.
const COLOR_KEYS: Record<string, string> = {
  '#ffffff': 'white',
  '#000000': 'black',
  '#ff3b30': 'red',
  '#ff9500': 'orange',
  '#ffcc00': 'yellow',
  '#34c759': 'green',
  '#5ac8fa': 'light_blue',
  '#007aff': 'blue',
  '#5856d6': 'indigo',
  '#af52de': 'purple',
  '#ff2d55': 'pink',
  '#a2845e': 'brown',
  '#884cff': 'violet',
  '#ff5757': 'coral',
  '#5271ff': 'blue',
};

/** The name of a colour of the story composer; its code when it has none. */
export function storyColorName(t: TFunction, color: string): string {
  const key = COLOR_KEYS[color.toLowerCase()];
  return key ? t(`createPost.storyComposer.colors.${key}`) : color;
}
