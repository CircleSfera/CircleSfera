import { LetterText, WrapText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SliderControl from './SliderControl';

interface StoryTextTypePanelProps {
  letterSpacing: number;
  onLetterSpacingChange: (spacing: number) => void;
  width: number;
  onWidthChange: (width: number) => void;
  gradientColors?: [string, string];
  onGradientChange: (colors: [string, string] | undefined) => void;
  gradientPresets: readonly [string, string][];
}

/**
 * The type options of text mode that are used less: a gradient for the
 * letters, the spacing between them and the width of the text. The font is
 * chosen above the keyboard and the size at the left of the screen.
 */
export default function StoryTextTypePanel({
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
    <div className="px-4 pt-2 space-y-2 pb-2 max-h-[min(32dvh,220px)] overflow-y-auto no-scrollbar">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-xs font-bold uppercase tracking-wider text-white/50 shrink-0">
          {t('createPost.storyComposer.text_gradient')}
        </span>
        <button
          type="button"
          onClick={() => onGradientChange(undefined)}
          className={`w-11 h-11 rounded-full border-2 shrink-0 flex items-center justify-center ${
            !gradientColors
              ? 'border-white bg-white/10 text-white'
              : 'border-white/15 text-white/40'
          }`}
          aria-label={t('createPost.storyComposer.text_solid')}
        >
          <X size={12} aria-hidden />
        </button>
        {gradientPresets.map((g) => (
          <button
            type="button"
            key={g[0]}
            onClick={() => onGradientChange(g)}
            className={`w-11 h-11 rounded-full shrink-0 border-2 transition-transform ${
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
