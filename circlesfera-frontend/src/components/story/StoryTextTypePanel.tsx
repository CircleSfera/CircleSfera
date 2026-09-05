import { ALargeSmall, LetterText, WrapText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SliderControl from './SliderControl';
import type { StoryFontOption } from './storyComposer.types';

interface StoryTextTypePanelProps {
  fonts: readonly StoryFontOption[];
  fontFamily: string;
  onFontChange: (font: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  letterSpacing: number;
  onLetterSpacingChange: (spacing: number) => void;
  width: number;
  onWidthChange: (width: number) => void;
  gradientColors?: [string, string];
  onGradientChange: (colors: [string, string] | undefined) => void;
  gradientPresets: readonly [string, string][];
}

/** Aa drawer: fonts + gradients + size/spacing/width (progressive disclosure). */
export default function StoryTextTypePanel({
  fonts,
  fontFamily,
  onFontChange,
  fontSize,
  onFontSizeChange,
  letterSpacing,
  onLetterSpacingChange,
  width,
  onWidthChange,
  gradientColors,
  onGradientChange,
  gradientPresets,
}: StoryTextTypePanelProps) {
  const { t } = useTranslation();

  return (
    <div className="px-3 pt-2 space-y-2 border-b border-white/8 pb-2 max-h-[min(32dvh,220px)] overflow-y-auto no-scrollbar">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {fonts.map((font) => (
          <button
            type="button"
            key={font.name}
            onClick={() => onFontChange(font.name)}
            className={`min-h-9 px-3 rounded-full text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
              fontFamily === font.name
                ? 'bg-white text-black border-white'
                : 'text-white/55 border-white/10 bg-white/5'
            }`}
            style={{ fontFamily: `"${font.name}", ${font.style}` }}
          >
            {font.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/35 shrink-0">
          {t('createPost.storyComposer.text_gradient')}
        </span>
        <button
          type="button"
          onClick={() => onGradientChange(undefined)}
          className={`w-7 h-7 rounded-full border-2 shrink-0 flex items-center justify-center ${
            !gradientColors
              ? 'border-white bg-white/10 text-white'
              : 'border-white/15 text-white/40'
          }`}
          aria-label={t('createPost.storyComposer.text_solid')}
        >
          <X size={10} />
        </button>
        {gradientPresets.map((g) => (
          <button
            type="button"
            key={g[0]}
            onClick={() => onGradientChange(g)}
            className={`w-7 h-7 rounded-full shrink-0 border-2 transition-transform ${
              gradientColors?.[0] === g[0]
                ? 'border-white scale-110'
                : 'border-transparent'
            }`}
            style={{
              background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
            }}
            aria-label={`${g[0]} → ${g[1]}`}
          />
        ))}
      </div>

      <SliderControl
        icon={ALargeSmall}
        label={t('createPost.storyComposer.font_size')}
        value={fontSize}
        min={12}
        max={120}
        step={1}
        unit="px"
        onChange={onFontSizeChange}
        onDoubleClick={() => onFontSizeChange(24)}
      />
      <SliderControl
        icon={LetterText}
        label={t('createPost.storyComposer.letter_spacing')}
        value={letterSpacing}
        min={-4}
        max={40}
        step={0.5}
        unit="px"
        onChange={onLetterSpacingChange}
        onDoubleClick={() => onLetterSpacingChange(0)}
      />
      <SliderControl
        icon={WrapText}
        label={t('createPost.storyComposer.canvas_width')}
        value={width}
        min={0}
        max={800}
        step={5}
        unit="px"
        format={(v) =>
          v === 0 ? t('createPost.storyComposer.width_auto') : `${v}px`
        }
        onChange={onWidthChange}
        onDoubleClick={() => onWidthChange(0)}
      />
    </div>
  );
}
