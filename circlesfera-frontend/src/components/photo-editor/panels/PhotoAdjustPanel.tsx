import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_PHOTO_ADJUSTMENTS,
  PHOTO_ADJUSTMENT_CONFIG,
} from '../photoEditor.constants';
import { PHOTO_RANGE_CLASS } from '../photoEditor.look';
import type { PhotoEditorState } from '../usePhotoEditor';

const AdjustmentSlider = ({
  label,
  value,
  defaultValue,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  unit: string;
  onChange: (val: number) => void;
}) => {
  const isModified = value !== defaultValue;
  return (
    <motion.div
      className="space-y-1 px-0.5 py-0.5"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
    >
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-white/70 truncate pr-2">{label}</span>
        <span
          className={`tabular-nums shrink-0 ${isModified ? 'text-brand-primary' : 'text-white/45'}`}
        >
          {value}
          {unit}
        </span>
      </div>
      <div className="relative h-11 flex items-center">
        {min === 0 && max >= 200 && (
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2 pointer-events-none" />
        )}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          aria-label={label}
          aria-valuetext={`${value}${unit}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-full ${PHOTO_RANGE_CLASS}`}
        />
      </div>
    </motion.div>
  );
};

export default function PhotoAdjustPanel({
  editor,
}: {
  editor: PhotoEditorState;
}) {
  const { t } = useTranslation();
  const { activeAdjustment, adjustments, setAdjustments } = editor;

  return (
    <motion.div
      key="adjust"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="w-full sm:max-w-sm mx-auto px-4"
    >
      {PHOTO_ADJUSTMENT_CONFIG.map((adj) =>
        activeAdjustment === adj.key ? (
          <AdjustmentSlider
            key={adj.key}
            label={t(`createPost.edit.adjust.${adj.labelKey}`)}
            value={adjustments[adj.key]}
            defaultValue={DEFAULT_PHOTO_ADJUSTMENTS[adj.key]}
            min={adj.min}
            max={adj.max}
            unit={adj.unit}
            onChange={(v) => setAdjustments((p) => ({ ...p, [adj.key]: v }))}
          />
        ) : null,
      )}
    </motion.div>
  );
}
