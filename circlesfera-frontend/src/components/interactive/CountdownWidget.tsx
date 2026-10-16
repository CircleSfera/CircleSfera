import { Bell, BellRing, Loader2, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';
import { CountdownClock, timeLeft, useNow } from './CountdownClock';
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
 * A countdown of a story: its title and the time left, counting down. A
 * viewer asks to be reminded when it ends, or stops asking; the author sees
 * how many asked in the viewers sheet instead.
 */
export function CountdownWidget({
  stickerId,
  isAuthor = false,
}: {
  stickerId: string;
  isAuthor?: boolean;
}) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState<StickerResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const now = useNow();

  useEffect(() => {
    let current = true;
    setCountdown(null);
    setLoadFailed(false);
    readSticker(stickerId)
      .then((results) => {
        if (current) setCountdown(results);
      })
      .catch((err) => {
        logger.error('Failed to load countdown:', err);
        if (current) setLoadFailed(true);
      });
    return () => {
      current = false;
    };
  }, [stickerId]);

  if (loadFailed) {
    return (
      <div className={`${STICKER_CARD} py-6 text-center`}>
        <p role="alert" className="text-xs font-medium text-white/80">
          {t('interactive.countdown.load_error')}
        </p>
      </div>
    );
  }

  if (!countdown?.settings.endsAt) {
    return (
      <div
        className={`${STICKER_CARD} flex items-center justify-center py-6 text-white/60`}
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden />
        <span className="text-xs font-medium">
          {t('interactive.countdown.loading')}
        </span>
      </div>
    );
  }

  const { title, endsAt } = countdown.settings;
  const reminded = countdown.myResponse !== null;
  const ended = timeLeft(endsAt, now).done;

  const toggle = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setCountdown(await answerSticker(stickerId, { remind: !reminded }));
    } catch (err) {
      logger.error('Failed to set the reminder:', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={STICKER_CARD}>
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <Timer size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <h4 className={STICKER_LABEL}>{t('interactive.countdown.title')}</h4>
      </div>
      {title ? <p className={STICKER_TITLE}>{title}</p> : null}
      <CountdownClock endsAt={endsAt} />
      {!isAuthor && !ended ? (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={reminded}
          className={`mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-60 ${
            reminded
              ? 'bg-white text-black'
              : 'border border-white/15 bg-surface-high text-white'
          }`}
        >
          {reminded ? (
            <BellRing size={16} aria-hidden />
          ) : (
            <Bell size={16} aria-hidden />
          )}
          {reminded
            ? t('interactive.countdown.reminded')
            : t('interactive.countdown.remind')}
        </button>
      ) : null}
      {failed ? (
        <p role="alert" className="mt-2 text-xs font-medium text-white/80">
          {t('interactive.countdown.remind_error')}
        </p>
      ) : null}
    </div>
  );
}
