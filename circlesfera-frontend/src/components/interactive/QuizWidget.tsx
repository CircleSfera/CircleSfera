import { BadgeCheck, Check, Loader2, X } from 'lucide-react';
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
  STICKER_ROW_PLAIN,
  STICKER_ROW_SHAPE,
  STICKER_TITLE,
} from './stickerStyles';

const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * A quiz of a story: one answer per person; then the right answer shows in
 * green, a wrong choice in red, and how many chose each.
 */
export function QuizWidget({ stickerId }: { stickerId: string }) {
  const { t } = useTranslation();
  const [quiz, setQuiz] = useState<StickerResults | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    readSticker(stickerId)
      .then(setQuiz)
      .catch((err) => logger.error('Failed to load quiz:', err));
  }, [stickerId]);

  if (!quiz) {
    return (
      <div
        className={`${STICKER_CARD} flex items-center justify-center py-6 text-white/60`}
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden />
        <span className="text-xs font-medium">
          {t('interactive.quiz.loading')}
        </span>
      </div>
    );
  }

  const options = quiz.settings.options ?? [];
  const mine = quiz.myResponse?.optionIndex ?? null;
  const answered = mine !== null;
  const correct = quiz.settings.correctIndex;

  const answer = async (optionIndex: number) => {
    if (answered || sending) return;
    try {
      setSending(true);
      setFailed(false);
      setQuiz(await answerSticker(stickerId, { optionIndex }));
    } catch (err) {
      logger.error('Failed to answer quiz:', err);
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={STICKER_CARD}>
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <BadgeCheck size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <h4 className={STICKER_LABEL}>{t('interactive.quiz.title')}</h4>
      </div>
      <p className={STICKER_TITLE}>{quiz.settings.question}</p>
      <div className="space-y-1.5">
        {options.map((text, index) => {
          const isRight = answered && index === correct;
          const isWrongPick = answered && index === mine && index !== correct;
          const votes = quiz.options?.[index]?.votes ?? 0;
          return (
            <button
              type="button"
              key={text}
              onClick={() => answer(index)}
              disabled={answered || sending}
              aria-pressed={index === mine}
              aria-label={t('interactive.quiz.option', {
                letter: letter(index),
                text,
              })}
              className={`${STICKER_ROW_SHAPE} flex items-center gap-2 py-2 text-left disabled:cursor-default ${
                isRight
                  ? 'border-green-500 bg-green-500/20'
                  : isWrongPick
                    ? 'border-red-500 bg-red-500/20'
                    : STICKER_ROW_PLAIN
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                {isRight ? (
                  <Check size={14} aria-hidden />
                ) : isWrongPick ? (
                  <X size={14} aria-hidden />
                ) : (
                  letter(index)
                )}
              </span>
              <span className="flex-1 min-w-0 break-words">{text}</span>
              {answered ? (
                <span className="text-xs font-bold text-white/80">{votes}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {failed ? (
        <p role="alert" className="mt-2 text-xs font-medium text-white/80">
          {t('interactive.quiz.answer_error')}
        </p>
      ) : null}
      <div className="flex justify-between items-center text-xs text-white/60 pt-2">
        <span>
          {t('interactive.quiz.answers', { count: quiz.totalResponses })}
        </span>
        {answered ? (
          <span
            className={mine === correct ? 'text-emerald-400 font-medium' : ''}
          >
            {mine === correct
              ? t('interactive.quiz.right')
              : t('interactive.quiz.wrong')}
          </span>
        ) : null}
      </div>
    </div>
  );
}
