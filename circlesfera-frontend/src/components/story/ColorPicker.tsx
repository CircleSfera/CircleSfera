import { motion } from 'framer-motion';

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  colors?: string[];
}

const DEFAULT_COLORS = [
  '#FFFFFF', // White
  '#000000', // Black
  '#FF3B30', // Red
  '#FF9500', // Orange
  '#FFCC00', // Yellow
  '#34C759', // Green
  '#5AC8FA', // Light Blue
  '#007AFF', // Blue
  '#5856D6', // Indigo
  '#AF52DE', // Purple
  '#FF2D55', // Pink
  '#A2845E', // Brown
];

export default function ColorPicker({
  selectedColor,
  onColorSelect,
  colors = DEFAULT_COLORS,
}: ColorPickerProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar px-0.5">
      {colors.map((color) => {
        const isSelected = selectedColor === color;
        const isBlack = color === '#000000';
        return (
          <motion.button
            type="button"
            key={color}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => onColorSelect(color)}
            className="relative shrink-0 flex items-center justify-center"
            title={color}
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
                w-7 h-7 rounded-full transition-shadow duration-200
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
