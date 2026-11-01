import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CaseSensitive,
  Palette,
  Type,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import StoryTextSizeSlider from './StoryTextSizeSlider';
import StoryTextTypePanel from './StoryTextTypePanel';
import { storyColorName } from './storyColorNames';
import { STORY_COLORS } from './storyComposer.constants';
import type { StoryFontOption } from './storyComposer.types';
import { useStoryKeyboardInset } from './useStoryKeyboardInset';

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
  /** Ends the text, as Done: a tap outside it and Escape do the same. */
  onDone: () => void;
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

/** The parts of text mode (`data-story-text-keep`): a tap elsewhere ends it. */
const TEXT_MODE_KEEP = '[data-story-text-keep]';

/**
 * A tap on a control of text mode leaves the focus in the text, so the
 * keyboard stays open; the keyboard and screen readers still reach it.
 */
const keepKeyboard = {
  onPointerDown: (e: React.PointerEvent) => e.preventDefault(),
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
};

/**
 * Whether a tap is on the editor but not on a part of text mode. A tap
 * beyond the editor (the side menu on a wide screen) does what it does.
 */
const outsideTheText = (target: EventTarget | null, editor: Element | null) =>
  target instanceof Element &&
  target.closest(TEXT_MODE_KEEP) === null &&
  (editor === null || editor.contains(target));

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
 * Text mode, as on Instagram: the text is written on the story itself, with
 * the keyboard open. The top bar holds alignment, the text's background, the
 * colours and the type options, and Done; the size is a slider at the left;
 * right above the keyboard, the fonts, or the colours or styles while their
 * button is on. A tap outside the text, or Escape, ends it as Done does.
 */
export default function StoryTextTakeoverChrome({
  onDone,
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
  const keyboardInset = useStoryKeyboardInset();
  const [showTypePanel, setShowTypePanel] = useState(false);
  const [row, setRow] = useState<BottomRow>('fonts');
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const rootRef = useRef<HTMLDivElement>(null);

  // A tap that starts and ends outside the text ends it; so does Escape.
  // The tap that opened text mode came before these listeners.
  useEffect(() => {
    const editor =
      rootRef.current?.closest('[data-testid="story-composer"]') ?? null;
    let downOutside = false;
    const down = (e: PointerEvent) => {
      downOutside = outsideTheText(e.target, editor);
    };
    const click = (e: MouseEvent) => {
      if (!downOutside || !outsideTheText(e.target, editor)) return;
      downOutside = false;
      e.preventDefault();
      e.stopPropagation();
      onDoneRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onDoneRef.current();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key);
    };
  }, []);

  const toggleRow = (next: BottomRow) =>
    setRow((current) => (current === next ? 'fonts' : next));
  const AlignIcon =
    align === 'left' ? AlignLeft : align === 'right' ? AlignRight : AlignCenter;
  const nextAlign = NEXT_ALIGN[align];

  return (
    // The bars and the band between them end where the keyboard begins.
    <div
      ref={rootRef}
      className="absolute inset-x-0 top-0 z-50 flex flex-col pointer-events-none"
      style={{ bottom: keyboardInset }}
      data-export-ignore="true"
      data-testid="story-text-mode"
    >
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 px-3 pt-[max(0.5rem,calc(env(safe-area-inset-top,0px)+0.25rem))]"
        data-testid="story-text-top-bar"
      >
        <div
          className="pointer-events-auto col-start-2 flex items-center gap-1"
          data-story-text-keep=""
        >
          <button
            type="button"
            {...keepKeyboard}
            onClick={() => onAlignChange(nextAlign)}
            className={iconButton(false)}
            aria-label={t(`createPost.storyComposer.align_${nextAlign}`)}
            title={t(`createPost.storyComposer.align_${nextAlign}`)}
          >
            <AlignIcon size={20} aria-hidden />
          </button>
          <button
            type="button"
            {...keepKeyboard}
            onClick={() => toggleRow('styles')}
            className={iconButton(row === 'styles')}
            aria-label={t('createPost.storyComposer.text_styles')}
            title={t('createPost.storyComposer.text_styles')}
            aria-pressed={row === 'styles'}
          >
            <CaseSensitive size={20} aria-hidden />
          </button>
          <button
            type="button"
            {...keepKeyboard}
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
            {...keepKeyboard}
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
          {...keepKeyboard}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }}
          className="pointer-events-auto justify-self-end min-h-11 min-w-11 px-3 text-sm font-bold text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.65))]"
          data-story-text-keep=""
        >
          {t('createPost.storyComposer.done')}
        </button>
      </div>

      {/* The free band: the text is centred in it, the size at its left. */}
      <div
        className="relative flex-1 min-h-0 flex items-center pl-1"
        data-story-text-band=""
      >
        <div className="pointer-events-auto" data-story-text-keep="">
          <StoryTextSizeSlider value={fontSize} onChange={onFontSizeChange} />
        </div>
      </div>

      <div
        className={`pointer-events-auto ${keyboardInset > 0 ? '' : 'safe-area-bottom'}`}
        data-testid="story-text-bottom-row"
        data-story-text-keep=""
      >
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
                  {...keepKeyboard}
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
                    {...keepKeyboard}
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
                    {...keepKeyboard}
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
  );
}
