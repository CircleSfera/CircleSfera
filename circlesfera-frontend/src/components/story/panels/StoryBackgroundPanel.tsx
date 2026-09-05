import { motion } from 'framer-motion';
import { Eye, Image as ImageIcon, SunDim } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import SliderControl from '../SliderControl';
import { GRADIENTS } from '../storyComposer.constants';

export interface StoryBackgroundPanelProps {
  bgStyle: string;
  backgroundUrl: string | null;
  bgBlur: number;
  bgDarken: number;
  onUploadBackground: (e: MouseEvent<HTMLButtonElement>) => void;
  onSelectGradient: (grad: string) => void;
  onBgBlurChange: (blur: number) => void;
  onBgDarkenChange: (darken: number) => void;
}

export default function StoryBackgroundPanel({
  bgStyle,
  backgroundUrl,
  bgBlur,
  bgDarken,
  onUploadBackground,
  onSelectGradient,
  onBgBlurChange,
  onBgDarkenChange,
}: StoryBackgroundPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      key="background-tab"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.25 }}
      className="px-3 space-y-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold text-white/40 uppercase tracking-[0.14em]">
          {t('createPost.storyComposer.backgrounds')}
        </span>
        <button
          type="button"
          onClick={onUploadBackground}
          className="min-h-10 text-xs bg-white/8 hover:bg-white/12 px-3 rounded-xl border border-white/10 flex items-center gap-1.5 transition-all font-semibold text-white/70 hover:text-white"
        >
          <ImageIcon size={14} /> {t('createPost.storyComposer.upload')}
        </button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
        {GRADIENTS.map((grad) => (
          <button
            type="button"
            key={grad}
            onClick={() => onSelectGradient(grad)}
            className={`aspect-[9/16] w-11 shrink-0 rounded-lg border-2 transition-all duration-200 ${
              bgStyle === grad
                ? 'border-white scale-[1.03] shadow-lg shadow-black/40'
                : 'border-white/10 hover:border-white/25 opacity-85 hover:opacity-100'
            }`}
            style={
              grad.startsWith('linear-gradient') ||
              grad.startsWith('radial-gradient')
                ? { backgroundImage: grad }
                : { backgroundColor: grad }
            }
            aria-label={t('createPost.storyComposer.backgrounds')}
            aria-pressed={bgStyle === grad}
          />
        ))}
      </div>
      {backgroundUrl && (
        <div className="space-y-0 rounded-lg border border-white/8 bg-white/3 px-2.5 py-1">
          <SliderControl
            icon={SunDim}
            label={t('createPost.storyComposer.blur')}
            value={bgBlur}
            min={0}
            max={20}
            step={0.5}
            unit="px"
            onChange={onBgBlurChange}
            onDoubleClick={() => onBgBlurChange(0)}
          />
          <SliderControl
            icon={Eye}
            label={t('createPost.storyComposer.darken')}
            value={bgDarken}
            min={0}
            max={80}
            step={1}
            unit="%"
            onChange={onBgDarkenChange}
            onDoubleClick={() => onBgDarkenChange(0)}
          />
        </div>
      )}
    </motion.div>
  );
}
