import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CaseSensitive,
  Palette,
  Type,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import StoryTextSizeSlider from './StoryTextSizeSlider';
import StoryTextTypePanel from './StoryTextTypePanel';
import { storyColorName } from './storyColorNames';
import { STORY_COLORS } from './storyComposer.constants';
import type { StoryFontOption } from './storyComposer.types';

/** The colours of the text, each with a name for screen readers. */
const TEXT_COLORS = STORY_COLORS;

type Align = 'left' | 'center' | 'right';
const NEXT_ALIGN: Record<Align, Align> = {
  center: 'left',
  left: 'right',
  right: 'center',
};

/** What the row above the keyboard shows. */
type BottomRow = 'fonts' | 'colors' | 'styles';

export type { StoryFontOption };

interface StoryTextTakeoverChromeProps {
  onCancel: () => void;
  onDone: () => void;
  canDone: boolean;
  textColor: string;
  onColorChange: (color: string) => void;
  textStyle: StoryElement['textStyle'];
  onStyleChange: (style: StoryElement['textStyle']) => void;
  align: Align;
  onAlignChange: (align: Align) => void;
  styleOptions: { id: StoryElement['textStyle']; label: string }[];
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

const iconButton = (active: boolean) =>
  `w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
    active
      ? 'bg-white text-black'
      : 'text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.65))] hover:bg-white/10'
  }`;

const chip = (active: boolean) =>
  `min-h-11 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 border transition-colors ${
    active
      ? 'bg-white text-black border-white'
      : 'bg-black/40 text-white border-white/15'
  }`;

/**
 * Text mode, as on Instagram: the text is written on the story itself; the
 * top bar holds alignment, the style of the text, colours and the type
 * options; the size is a slider at the left; above the keyboard, the fonts,
 * or the colours or styles when their button is on.
 */
export default function StoryTextTakeoverChrome({
  onCancel,
  onDone,
  canDone,
  textColor,
  onColorChange,
  textStyle,
  onStyleChange,
  align,
  onAlignChange,
  styleOptions,
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
}: StoryTextTakeoverChromeProps) {
  const { t } = useTranslation();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [showTypePanel, setShowTypePanel] = useState(false);
  const [row, setRow] = useState<BottomRow>('fonts');

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  const toggleRow = (next: BottomRow) =>
    setRow((current) => (current === next ? 'fonts' : next));
  const AlignIcon =
    align === 'left' ? AlignLeft : align === 'right' ? AlignRight : AlignCenter;
  const nextAlign = NEXT_ALIGN[align];

  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 z-50 flex items-center gap-1 px-3 pt-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.35rem))] pointer-events-none"
        data-export-ignore="true"
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }}
          className="pointer-events-auto min-h-11 px-2 text-sm font-semibold text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.65))]"
        >
          {t('createPost.storyComposer.cancel')}
        </button>

        <div className="pointer-events-auto flex flex-1 items-center justify-center gap-0.5">
          <button
            type="button"
            onClick={() => onAlignChange(nextAlign)}
            className={iconButton(false)}
            aria-label={t(`createPost.storyComposer.align_${nextAlign}`)}
            title={t(`createPost.storyComposer.align_${nextAlign}`)}
          >
            <AlignIcon size={20} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => toggleRow('styles')}
            className={iconButton(row === 'styles')}
            aria-label={t('createPost.storyComposer.text_styles')}
            title={t('createPost.storyComposer.text_styles')}
            aria-pressed={row === 'styles'}
          >
            <CaseSensitive size={22} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => toggleRow('colors')}
            className={iconButton(row === 'colors')}
            aria-label={t('createPost.storyComposer.text_colors')}
            title={t('createPost.storyComposer.text_colors')}
            aria-pressed={row === 'colors'}
          >
            <Palette size={20} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setShowTypePanel((v) => !v)}
            className={iconButton(showTypePanel)}
            aria-label={t('createPost.storyComposer.text_type')}
            title={t('createPost.storyComposer.text_type')}
            aria-pressed={showTypePanel}
          >
            <Type size={20} aria-hidden />
          </button>
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }}
          disabled={!canDone}
          className="pointer-events-auto min-h-11 px-2 text-sm font-bold text-white disabled:opacity-40 [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.65))]"
        >
          {t('createPost.storyComposer.done')}
        </button>
      </div>

      {/* The size of the text, at the left; it keeps its own size. */}
      <div
        className="absolute left-1 top-1/2 -translate-y-1/2 z-50"
        data-export-ignore="true"
      >
        <StoryTextSizeSlider value={fontSize} onChange={onFontSizeChange} />
      </div>

      <div
        className="absolute inset-x-0 z-50 pointer-events-none"
        data-export-ignore="true"
        style={{ bottom: keyboardInset }}
      >
        <div className="pointer-events-auto safe-area-bottom">
          {showTypePanel && (
            <div className="border-t border-white/10 bg-surface-elevated">
              <StoryTextTypePanel
                letterSpacing={letterSpacing}
                onLetterSpacingChange={onLetterSpacingChange}
                width={width}
                onWidthChange={onWidthChange}
                gradientColors={gradientColors}
                onGradientChange={onGradientChange}
                gradientPresets={gradientPresets}
              />
            </div>
          )}

          <div className="px-3 py-2 flex items-center lg:justify-center gap-2 overflow-x-auto no-scrollbar">
            {row === 'fonts'
              ? fonts.map((font) => (
                  <button
                    type="button"
                    key={font.name}
                    onClick={() => onFontChange(font.name)}
                    className={chip(fontFamily === font.name)}
                    style={{ fontFamily: `"${font.name}", ${font.style}` }}
                    aria-pressed={fontFamily === font.name}
                  >
                    {font.label}
                  </button>
                ))
              : row === 'colors'
                ? TEXT_COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => onColorChange(c)}
                      className={`w-11 h-11 rounded-full shrink-0 border-2 transition-transform ${
                        !gradientColors &&
                        textColor.toLowerCase() === c.toLowerCase()
                          ? 'border-white scale-110'
                          : 'border-white/30'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={t('createPost.storyComposer.text_color', {
                        color: storyColorName(t, c),
                      })}
                    />
                  ))
                : styleOptions.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => onStyleChange(s.id)}
                      className={chip(textStyle === s.id)}
                      aria-pressed={textStyle === s.id}
                    >
                      {s.label}
                    </button>
                  ))}
          </div>
        </div>
      </div>
    </>
  );
}
