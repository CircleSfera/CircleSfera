import { motion } from 'framer-motion';
import {
  ALargeSmall,
  Eraser,
  Highlighter,
  type LucideIcon,
  PenLine,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import ColorPicker from '../ColorPicker';
import type { StoryCanvasRef } from '../Editor/StoryCanvas';
import SliderControl from '../SliderControl';
import {
  BRUSH_WIDTH_MAX,
  BRUSH_WIDTH_MIN,
  DEFAULT_BRUSH_WIDTH,
} from '../storyComposer.constants';
import type { StoryBrush } from '../storyComposer.types';

const BRUSHES: { id: StoryBrush; icon: LucideIcon }[] = [
  { id: 'pen', icon: PenLine },
  { id: 'marker', icon: Highlighter },
  { id: 'neon', icon: Sparkles },
  { id: 'eraser', icon: Eraser },
];

export interface StoryDrawPanelProps {
  storyCanvasRef: RefObject<StoryCanvasRef | null>;
  brushWidth: number;
  brushColor: string;
  brush: StoryBrush;
  onBrushWidthChange: (width: number) => void;
  onBrushColorChange: (color: string) => void;
  onBrushChange: (brush: StoryBrush) => void;
}

export default function StoryDrawPanel({
  storyCanvasRef,
  brushWidth,
  brushColor,
  brush,
  onBrushWidthChange,
  onBrushColorChange,
  onBrushChange,
}: StoryDrawPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      key="draw-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
      className="px-3 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-white/40 uppercase tracking-[0.14em]">
          {t('createPost.storyComposer.draw_title')}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => storyCanvasRef.current?.undo()}
            className="min-h-11 min-w-11 rounded-full bg-white/6 hover:bg-white/10 border border-white/8 flex items-center justify-center text-white/70 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            aria-label={t('createPost.storyComposer.undo')}
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={() => storyCanvasRef.current?.clear()}
            className="min-h-11 min-w-11 rounded-full bg-white/6 hover:bg-brand-secondary/15 border border-white/8 flex items-center justify-center text-brand-secondary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            aria-label={t('createPost.storyComposer.clear_drawing')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <fieldset className="flex gap-2">
        <legend className="sr-only">
          {t('createPost.storyComposer.brushes')}
        </legend>
        {BRUSHES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onBrushChange(id)}
            aria-pressed={brush === id}
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              brush === id
                ? 'border-white bg-white text-black'
                : 'border-white/10 bg-white/6 text-white/80 hover:bg-white/10'
            }`}
          >
            <Icon size={18} aria-hidden />
            {t(`createPost.storyComposer.brush_${id}`)}
          </button>
        ))}
      </fieldset>
      <SliderControl
        icon={ALargeSmall}
        label={t('createPost.storyComposer.brush_size')}
        value={brushWidth}
        min={BRUSH_WIDTH_MIN}
        max={BRUSH_WIDTH_MAX}
        step={1}
        unit="px"
        onChange={onBrushWidthChange}
        onDoubleClick={() => onBrushWidthChange(DEFAULT_BRUSH_WIDTH)}
      />
      {/* The eraser has no colour. */}
      {brush !== 'eraser' ? (
        <div className="space-y-2">
          <span className="text-xs font-bold text-white/35 uppercase tracking-[0.14em]">
            {t('createPost.storyComposer.brush_color')}
          </span>
          <ColorPicker
            selectedColor={brushColor}
            onColorSelect={onBrushColorChange}
          />
        </div>
      ) : null}
    </motion.div>
  );
}
