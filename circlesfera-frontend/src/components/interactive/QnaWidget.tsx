import { HelpCircle, Loader2, Send } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';
import {
  STICKER_BADGE,
  STICKER_CARD,
  STICKER_HEADER,
  STICKER_LABEL,
  STICKER_TITLE,
} from './stickerStyles';

type QnaAnswer = {
  id: string;
  answerText: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    fullName?: string;
    avatar?: string | null;
  };
};

type QnaBoxData = {
  id: string;
  prompt: string;
  totalAnswers: number;
  answers: QnaAnswer[];
};

export const QnaWidget: React.FC<{
  qnaBoxId: string;
  prompt?: string;
  isOwner?: boolean;
}> = ({ qnaBoxId, prompt, isOwner = false }) => {
  const { t } = useTranslation();
  const [answerText, setAnswerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [box, setBox] = useState<QnaBoxData | null>(null);
  const [loadingAnswers, setLoadingAnswers] = useState(false);

  const displayPrompt =
    prompt || box?.prompt || t('interactive.qna.default_prompt');

  // The story or post carries the id of the box, not its question: it is
  // read here. The server gives the question to everyone and the answers
  // only to the creator, so the same request serves both.
  const loadBox = useCallback(async () => {
    if (!isOwner && prompt) return;
    try {
      setLoadingAnswers(true);
      const res = await apiClient.get<QnaBoxData>(
        `interactive/qna/${qnaBoxId}`,
      );
      setBox(res.data);
    } catch (err) {
      logger.error('Failed to load Q&A box:', err);
    } finally {
      setLoadingAnswers(false);
    }
  }, [isOwner, prompt, qnaBoxId]);

  useEffect(() => {
    void loadBox();
  }, [loadBox]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerText.trim()) return;

    try {
      setSubmitting(true);
      setSendFailed(false);
      await apiClient.post('interactive/qna/answer', {
        qnaBoxId,
        answerText,
      });
      setSent(true);
      setAnswerText('');
    } catch (err) {
      logger.error('Failed to submit Q&A answer:', err);
      // What was written stays in the field, to be sent again.
      setSendFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={STICKER_CARD}>
      <div className={STICKER_HEADER}>
        <span className={STICKER_BADGE}>
          <HelpCircle size={13} strokeWidth={2.5} aria-hidden />
        </span>
        <h4 className={STICKER_LABEL}>{t('interactive.qna.title')}</h4>
      </div>

      <p className={STICKER_TITLE}>{displayPrompt}</p>

      {isOwner ? (
        <div className="space-y-2">
          <p className="text-xs text-white/60 font-medium">
            {t('interactive.qna.answers_heading', {
              count: box?.totalAnswers ?? 0,
            })}
          </p>
          {loadingAnswers ? (
            <div className="flex items-center gap-2 text-white/40 text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('interactive.qna.loading_answers')}
            </div>
          ) : (box?.answers?.length ?? 0) === 0 ? (
            <p className="text-xs text-white/40">
              {t('interactive.qna.no_answers')}
            </p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {box?.answers.map((answer) => (
                <li
                  key={answer.id}
                  className="p-2.5 rounded-xl bg-surface-high border border-white/10"
                >
                  <p className="text-xs font-semibold text-brand-primary-text truncate">
                    @{answer.user.username}
                  </p>
                  <p className="text-xs text-white/90 mt-0.5">
                    {answer.answerText}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : sent ? (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-semibold text-center">
          {t('interactive.qna.sent')}
        </div>
      ) : (
        <div className="space-y-2">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              aria-label={t('interactive.qna.placeholder')}
              placeholder={t('interactive.qna.placeholder')}
              className="flex-1 min-w-0 min-h-12 px-3 bg-surface-high border border-white/15 rounded-xl text-base text-white placeholder-white/50 focus:outline-none focus:border-brand-primary"
            />
            <button
              type="submit"
              disabled={submitting || !answerText.trim()}
              aria-label={t('interactive.qna.send')}
              className="min-h-11 min-w-11 px-3 bg-brand-primary hover:opacity-90 text-white rounded-xl text-xs font-bold transition-opacity disabled:opacity-50 flex items-center justify-center"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <Send className="w-4 h-4" aria-hidden />
              )}
            </button>
          </form>
          {sendFailed && (
            <p role="alert" className="text-xs font-medium text-rose-400">
              {t('interactive.qna.send_error')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
