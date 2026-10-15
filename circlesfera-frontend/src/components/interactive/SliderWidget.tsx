import { Loader2, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';
import {
  answerSticker,
  readSticker,
  type StickerResults,
} from './stickerResults';
import {
  STICKER_BADGE,
  STICKER_CARD,
  STICKER_HEADER,
  STICKER_LABEL,
  STICKER_TITLE,
} from './stickerStyles';

/**
 * A slider of a story: the viewer slides the emoji and lets go; the answer
 * is sent then, and the average of everyone shows.
 */
export function SliderWidget({ stickerId }: { stickerId: string }) {
  const { t } = useTranslation();
  const [slider, setSlider] = useState<StickerResults | null>(null);
  const [value, setValue] = useState(0.5);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    readSticker(stickerId)
      .then((s) => {
        setSlider(s);
        if (s.myResponse?.value != null) setValue(s.myResponse.value);
      })
      .catch((err) => logger.error('Failed to load slider:', err));
  }, [stickerId]);

  if (!slider) {
    return (
      <div
        className={`${STICKER_CARD} flex items-center justify-center py-6 text-white/60`}
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden />
        <span className="text-xs font-medium">
          {t('interactive.slider.loading')}
        </span>
      </div>
    );
  }

  const send = async () => {
    try {
      setFailed(false);
      setSlider(await answerSticker(stickerId, { value }));
    } catch (err) {
      logger.error('Failed to answer slider:', err);
      setFailed(true);
    }
  };
  const answered = slider.myResponse !== null;
  const emoji = slider.settings.emoji ?? '😍';

  return (
    <div className={STICKER_CARD}>
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <SlidersHorizontal size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <h4 className={STICKER_LABEL}>{t('interactive.slider.title')}</h4>
      </div>
      {slider.settings.question ? (
        <p className={STICKER_TITLE}>{slider.settings.question}</p>
      ) : null}
      <div className="relative h-11 flex items-center">
        <div className="absolute inset-x-0 h-2 rounded-full bg-linear-to-r from-white/20 to-brand-primary/70" />
        {answered && slider.average != null ? (
          <span
            className="absolute h-4 w-1 -translate-x-1/2 rounded-full bg-white"
            style={{ left: `${slider.average * 100}%` }}
            aria-hidden
          />
        ) : null}
        <span
          className="absolute -translate-x-1/2 text-3xl leading-none pointer-events-none"
          style={{ left: `${value * 100}%` }}
          aria-hidden
        >
          {emoji}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerUp={send}
          onKeyUp={send}
          aria-label={t('interactive.slider.label')}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-xs font-medium text-white/80">
          {t('interactive.slider.answer_error')}
        </p>
      ) : null}
      {answered ? (
        <div className="flex justify-between items-center text-xs text-white/60 pt-2">
          <span>
            {t('interactive.slider.average', {
              percent: Math.round((slider.average ?? 0) * 100),
            })}
          </span>
          <span className="text-emerald-400 font-medium">
            {t('interactive.slider.sent')}
          </span>
        </div>
      ) : null}
    </div>
  );
}
