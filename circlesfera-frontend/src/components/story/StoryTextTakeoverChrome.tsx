import { AlignCenter, AlignLeft, AlignRight, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryElement } from '../../types';
import StoryTextTypePanel from './StoryTextTypePanel';
import type { StoryFontOption } from './storyComposer.types';

const STYLE_COLORS = [
  '#FFFFFF',
  '#000000',
  '#8c52ff',
  '#ff5757',
  '#5271ff',
] as const;

export type { StoryFontOption };

interface StoryTextTakeoverChromeProps {
  onCancel: () => void;
  onDone: () => void;
  canDone: boolean;
  textColor: string;
  onColorChange: (color: string) => void;
  textStyle: StoryElement['textStyle'];
  onStyleChange: (style: StoryElement['textStyle']) => void;
  align: 'left' | 'center' | 'right';
  onAlignChange: (align: 'left' | 'center' | 'right') => void;
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

/**
 * Text takeover chrome (ADR-0018): Cancelar/Listo + one style strip.
 * Fonts / size / spacing / width / gradients live under Aa (progressive disclosure).
 * Dock rides visualViewport so it sits above the keyboard.
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

  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.35rem))] pointer-events-none"
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
          className="pointer-events-auto min-h-11 px-2 text-[15px] font-semibold text-white/75 hover:text-white"
        >
          {t('createPost.storyComposer.cancel')}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }}
          disabled={!canDone}
          className="pointer-events-auto min-h-11 px-5 rounded-full bg-linear-to-r from-brand-primary to-brand-blue text-white text-xs font-bold disabled:opacity-40"
        >
          {t('createPost.storyComposer.done')}
        </button>
      </div>

      <div
        className="absolute inset-x-0 z-50 pointer-events-none"
        data-export-ignore="true"
        style={{ bottom: keyboardInset }}
      >
        <div className="pointer-events-auto border-t border-white/10 bg-zinc-900/95 backdrop-blur-xl safe-area-bottom">
          {showTypePanel && (
            <StoryTextTypePanel
              fonts={fonts}
              fontFamily={fontFamily}
              onFontChange={onFontChange}
              fontSize={fontSize}
              onFontSizeChange={onFontSizeChange}
              letterSpacing={letterSpacing}
              onLetterSpacingChange={onLetterSpacingChange}
              width={width}
              onWidthChange={onWidthChange}
              gradientColors={gradientColors}
              onGradientChange={onGradientChange}
              gradientPresets={gradientPresets}
            />
          )}

          <div className="px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {STYLE_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => onColorChange(c)}
                className={`w-7 h-7 rounded-full shrink-0 border-2 transition-transform ${
                  !gradientColors && textColor.toLowerCase() === c.toLowerCase()
                    ? 'border-white scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
            <div className="w-px h-6 bg-white/10 shrink-0 mx-0.5" />
            {styleOptions.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => onStyleChange(s.id)}
                className={`min-h-8 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 ${
                  textStyle === s.id
                    ? 'bg-white/18 text-white'
                    : 'bg-white/8 text-white/55'
                }`}
              >
                {s.label}
              </button>
            ))}
            <div className="w-px h-6 bg-white/10 shrink-0 mx-0.5" />
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => onAlignChange(a)}
                className={`min-w-9 min-h-9 rounded-full flex items-center justify-center shrink-0 ${
                  align === a
                    ? 'bg-brand-primary text-white'
                    : 'bg-white/8 text-white/55'
                }`}
                aria-label={a}
              >
                {a === 'left' ? (
                  <AlignLeft size={14} />
                ) : a === 'center' ? (
                  <AlignCenter size={14} />
                ) : (
                  <AlignRight size={14} />
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowTypePanel((v) => !v)}
              className={`min-w-9 min-h-9 rounded-full flex items-center justify-center shrink-0 ${
                showTypePanel
                  ? 'bg-brand-primary text-white'
                  : 'bg-white/8 text-white/55'
              }`}
              aria-label={t('createPost.storyComposer.text_type')}
              aria-pressed={showTypePanel}
            >
              <Type size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
