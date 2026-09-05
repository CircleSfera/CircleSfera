import { HelpCircle, Loader2, Send } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';

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
  const [box, setBox] = useState<QnaBoxData | null>(null);
  const [loadingAnswers, setLoadingAnswers] = useState(false);

  const displayPrompt =
    prompt ||
    box?.prompt ||
    t('interactive.qna.default_prompt', 'Ask me anything…');

  const loadAnswers = useCallback(async () => {
    if (!isOwner) return;
    try {
      setLoadingAnswers(true);
      const res = await apiClient.get<QnaBoxData>(
        `interactive/qna/${qnaBoxId}`,
      );
      setBox(res.data);
    } catch (err) {
      logger.error('Failed to load Q&A answers:', err);
    } finally {
      setLoadingAnswers(false);
    }
  }, [isOwner, qnaBoxId]);

  useEffect(() => {
    void loadAnswers();
  }, [loadAnswers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerText.trim()) return;

    try {
      setSubmitting(true);
      await apiClient.post('interactive/qna/answer', {
        qnaBoxId,
        answerText,
      });
      setSent(true);
      setAnswerText('');
    } catch (err) {
      logger.error('Failed to submit Q&A answer:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 bg-linear-to-br from-purple-900/30 to-indigo-900/20 border border-purple-500/20 rounded-2xl space-y-3 shadow-lg">
      <div className="flex items-center space-x-2 text-purple-400">
        <HelpCircle className="w-4 h-4" />
        <h4 className="text-xs font-bold uppercase tracking-wider">
          {t('interactive.qna.title', 'Q&A')}
        </h4>
      </div>

      <p className="text-sm font-bold text-white tracking-tight">
        {displayPrompt}
      </p>

      {isOwner ? (
        <div className="space-y-2">
          <p className="text-[11px] text-white/50 font-medium">
            {t('interactive.qna.answers_heading', {
              count: box?.totalAnswers ?? 0,
              defaultValue: '{{count}} answers',
            })}
          </p>
          {loadingAnswers ? (
            <div className="flex items-center gap-2 text-white/40 text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('interactive.qna.loading_answers', 'Loading answers…')}
            </div>
          ) : (box?.answers?.length ?? 0) === 0 ? (
            <p className="text-xs text-white/40">
              {t('interactive.qna.no_answers', 'No answers yet.')}
            </p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {box?.answers.map((answer) => (
                <li
                  key={answer.id}
                  className="p-2.5 rounded-xl bg-black/30 border border-white/5"
                >
                  <p className="text-[11px] font-semibold text-purple-300 truncate">
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
          {t('interactive.qna.sent', 'Answer sent to the creator!')}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-center space-x-2">
          <input
            type="text"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder={t('interactive.qna.placeholder', 'Write your answer…')}
            className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-400 focus:outline-none focus:border-purple-400"
          />
          <button
            type="submit"
            disabled={submitting || !answerText.trim()}
            className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      )}
    </div>
  );
};
