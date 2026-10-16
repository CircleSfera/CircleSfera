import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { storyColorName } from './storyColorNames';
import { STORY_COLORS } from './storyComposer.constants';

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  colors?: readonly string[];
}

const DEFAULT_COLORS: readonly string[] = STORY_COLORS;

export default function ColorPicker({
  selectedColor,
  onColorSelect,
  colors = DEFAULT_COLORS,
}: ColorPickerProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar px-0.5">
      {colors.map((color) => {
        const isSelected = selectedColor.toLowerCase() === color.toLowerCase();
        const isBlack = color.toLowerCase() === '#000000';
        const name = storyColorName(t, color);
        return (
          <motion.button
            type="button"
            key={color}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => onColorSelect(color)}
            className="relative shrink-0 flex items-center justify-center"
            title={name}
            aria-label={name}
            aria-pressed={isSelected}
          >
            {/* Selection ring */}
            {isSelected && (
              <motion.div
                layoutId="color-picker-ring"
                className="absolute inset-[-3px] rounded-full border-2 border-white/70"
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              />
            )}
            <div
              className={`
                w-11 h-11 rounded-full transition-shadow duration-200
                ${isSelected ? 'shadow-md' : ''}
                ${isBlack ? 'border border-white/20' : ''}
              `}
              style={{ backgroundColor: color }}
            />
          </motion.button>
        );
      })}
    </div>
  );
}
