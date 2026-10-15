import { useTranslation } from 'react-i18next';

/** The slider is always this tall, whatever the size of the text. */
export const TEXT_SIZE_SLIDER_PX = 200;
const THUMB_PX = 24;
export const TEXT_SIZE_MIN = 12;
export const TEXT_SIZE_MAX = 120;

interface StoryTextSizeSliderProps {
  value: number;
  onChange: (size: number) => void;
}

/**
 * The size of the text in text mode, as on Instagram: an upright wedge, thin
 * at the bottom and wide at the top, with a white thumb; up is larger. It
 * has a fixed size. A native slider, invisible on top, takes the finger, the
 * keyboard and the screen reader.
 */
export default function StoryTextSizeSlider({
  value,
  onChange,
}: StoryTextSizeSliderProps) {
  const { t } = useTranslation();
  const share = (value - TEXT_SIZE_MIN) / (TEXT_SIZE_MAX - TEXT_SIZE_MIN);
  const thumbBottom = Math.round(share * (TEXT_SIZE_SLIDER_PX - THUMB_PX));

  return (
    <div
      className="relative w-11 shrink-0"
      style={{ height: TEXT_SIZE_SLIDER_PX }}
      data-testid="text-size-slider"
    >
      <svg
        className="absolute inset-x-0 mx-auto pointer-events-none [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.5))]"
        width={14}
        height={TEXT_SIZE_SLIDER_PX}
        viewBox={`0 0 14 ${TEXT_SIZE_SLIDER_PX}`}
        aria-hidden
      >
        <path
          d={`M1 6 Q7 0 13 6 L8 ${TEXT_SIZE_SLIDER_PX - 2} Q7 ${TEXT_SIZE_SLIDER_PX} 6 ${TEXT_SIZE_SLIDER_PX - 2} Z`}
          fill="rgba(255,255,255,0.4)"
        />
      </svg>
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.45)] pointer-events-none"
        style={{ width: THUMB_PX, height: THUMB_PX, bottom: thumbBottom }}
        aria-hidden
      />
      <input
        type="range"
        min={TEXT_SIZE_MIN}
        max={TEXT_SIZE_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(24)}
        aria-label={t('createPost.storyComposer.font_size')}
        aria-orientation="vertical"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 opacity-0 cursor-pointer"
        style={{ width: TEXT_SIZE_SLIDER_PX }}
      />
    </div>
  );
}
