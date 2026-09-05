import { motion } from 'framer-motion';
import { ALargeSmall, RotateCcw, Trash2 } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import ColorPicker from '../ColorPicker';
import type { StoryCanvasRef } from '../Editor/StoryCanvas';
import SliderControl from '../SliderControl';

export interface StoryDrawPanelProps {
  storyCanvasRef: RefObject<StoryCanvasRef | null>;
  brushWidth: number;
  brushColor: string;
  onBrushWidthChange: (width: number) => void;
  onBrushColorChange: (color: string) => void;
}

export default function StoryDrawPanel({
  storyCanvasRef,
  brushWidth,
  brushColor,
  onBrushWidthChange,
  onBrushColorChange,
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
        <span className="text-[11px] font-bold text-white/40 uppercase tracking-[0.14em]">
          {t('createPost.storyComposer.draw_title')}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => storyCanvasRef.current?.undo()}
            className="min-h-10 min-w-10 rounded-xl bg-white/6 hover:bg-white/10 border border-white/8 flex items-center justify-center text-white/70 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            aria-label={t('createPost.storyComposer.undo')}
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={() => storyCanvasRef.current?.clear()}
            className="min-h-10 min-w-10 rounded-xl bg-white/6 hover:bg-red-500/15 border border-white/8 flex items-center justify-center text-red-400/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25"
            aria-label={t('createPost.storyComposer.clear_drawing')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <SliderControl
        icon={ALargeSmall}
        label={t('createPost.storyComposer.brush_size')}
        value={brushWidth}
        min={1}
        max={30}
        step={1}
        unit="px"
        onChange={onBrushWidthChange}
        onDoubleClick={() => onBrushWidthChange(4)}
      />
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-white/35 uppercase tracking-[0.14em]">
          {t('createPost.storyComposer.brush_color')}
        </span>
        <ColorPicker
          selectedColor={brushColor}
          onColorSelect={onBrushColorChange}
        />
      </div>
    </motion.div>
  );
}
