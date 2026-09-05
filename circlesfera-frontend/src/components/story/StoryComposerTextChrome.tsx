import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import StoryTextTakeoverChrome from './StoryTextTakeoverChrome';
import {
  FONTS,
  GRADIENT_PRESETS,
  TAKEOVER_TEXT_STYLES,
} from './storyComposer.constants';

interface StoryComposerTextChromeProps {
  textTakeover: 'create' | 'edit';
  selectedElementId: string | null;
  textInput: string;
  textColor: string;
  textStyle: StoryElement['textStyle'];
  textAlign: 'left' | 'center' | 'right';
  textFont: string;
  textFontSize: number;
  textLetterSpacing: number;
  textWidth: number;
  textGradientColors?: [string, string];
  exitTextTakeover: (commit: boolean) => void;
  setTextColor: (c: string) => void;
  setTextGradientColors: (g: [string, string] | undefined) => void;
  setTextStyle: (s: StoryElement['textStyle']) => void;
  setTextAlign: (a: 'left' | 'center' | 'right') => void;
  setTextFont: (f: string) => void;
  setTextFontSize: (n: number) => void;
  setTextLetterSpacing: (n: number) => void;
  setTextWidth: (n: number) => void;
  updateElement: (id: string, updates: Partial<StoryElement>) => void;
}

/** Live-binds takeover chrome → draft state (+ selected text element while editing). */
export default function StoryComposerTextChrome({
  textTakeover,
  selectedElementId,
  textInput,
  textColor,
  textStyle,
  textAlign,
  textFont,
  textFontSize,
  textLetterSpacing,
  textWidth,
  textGradientColors,
  exitTextTakeover,
  setTextColor,
  setTextGradientColors,
  setTextStyle,
  setTextAlign,
  setTextFont,
  setTextFontSize,
  setTextLetterSpacing,
  setTextWidth,
  updateElement,
}: StoryComposerTextChromeProps) {
  const { t } = useTranslation();
  const editing = textTakeover === 'edit' && selectedElementId;

  const patch = (updates: Partial<StoryElement>) => {
    if (editing) updateElement(selectedElementId, updates);
  };

  return (
    <StoryTextTakeoverChrome
      onCancel={() => exitTextTakeover(false)}
      onDone={() => exitTextTakeover(true)}
      canDone={Boolean(textInput.trim()) || textTakeover === 'edit'}
      textColor={textColor}
      onColorChange={(c) => {
        setTextColor(c);
        setTextGradientColors(undefined);
        patch({ color: c, gradientColors: undefined });
      }}
      textStyle={textStyle}
      onStyleChange={(style) => {
        setTextStyle(style);
        patch({ textStyle: style });
      }}
      align={textAlign}
      onAlignChange={(a) => {
        setTextAlign(a);
        patch({ align: a });
      }}
      styleOptions={TAKEOVER_TEXT_STYLES.map((style) => ({
        id: style.id,
        label: t(`createPost.storyComposer.${style.labelKey}`),
      }))}
      fonts={FONTS}
      fontFamily={textFont}
      onFontChange={(font) => {
        setTextFont(font);
        patch({ fontFamily: font });
      }}
      fontSize={textFontSize}
      onFontSizeChange={(size) => {
        setTextFontSize(size);
        patch({ fontSize: size });
      }}
      letterSpacing={textLetterSpacing}
      onLetterSpacingChange={(spacing) => {
        setTextLetterSpacing(spacing);
        patch({ letterSpacing: spacing });
      }}
      width={textWidth}
      onWidthChange={(w) => {
        setTextWidth(w);
        patch({ width: w || undefined });
      }}
      gradientColors={textGradientColors}
      onGradientChange={(g) => {
        setTextGradientColors(g);
        patch({ gradientColors: g });
      }}
      gradientPresets={GRADIENT_PRESETS}
    />
  );
}
