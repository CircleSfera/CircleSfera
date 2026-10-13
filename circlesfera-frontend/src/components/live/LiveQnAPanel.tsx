import { HelpCircle, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initialsAvatarUrl } from '../../utils/initialsAvatar';
import { LiveSheet } from './LivePieces';

export interface LiveQuestion {
  id: string;
  question: string;
  username: string;
  avatar?: string;
  createdAt?: string;
}

interface LiveQnAPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isHost: boolean;
  questions: LiveQuestion[];
  onAskQuestion?: (q: string) => void;
  onHighlightQuestion?: (q: LiveQuestion) => void;
  onClearHighlight?: () => void;
  // Host: whether a question is on the video now.
  hasHighlight?: boolean;
}

export default function LiveQnAPanel({
  isOpen,
  onClose,
  isHost,
  questions,
  onAskQuestion,
  onHighlightQuestion,
  onClearHighlight,
  hasHighlight = false,
}: LiveQnAPanelProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !onAskQuestion) return;
    onAskQuestion(input);
    setInput('');
  };

  const footer = isHost ? (
    // Nothing to take off the video while no question is on it.
    hasHighlight ? (
      <button
        type="button"
        onClick={onClearHighlight}
        className="button-alone min-h-12 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-colors"
      >
        {t('live.qna.clear_screen')}
      </button>
    ) : null
  ) : (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t('live.qna.placeholder')}
        aria-label={t('live.qna.placeholder')}
        className="flex-1 min-w-0 min-h-12 bg-white/10 border border-white/10 rounded-full px-4 text-base text-white outline-none focus:border-brand-primary"
      />
      <button
        type="submit"
        disabled={!input.trim()}
        className="w-11 h-11 flex items-center justify-center bg-brand-primary rounded-full text-white disabled:opacity-50 hover:bg-brand-primary/90 transition-colors shrink-0"
        aria-label={t('live.qna.send')}
      >
        <Send size={18} />
      </button>
    </form>
  );

  return (
    <LiveSheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('live.qna.title')}
      icon={<HelpCircle size={20} className="shrink-0" aria-hidden />}
      footer={footer}
    >
      <div className="space-y-3">
        {questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-white/60">
            <HelpCircle size={40} className="mb-2 opacity-50" />
            <p>
              {isHost ? t('live.qna.empty_host') : t('live.qna.empty_viewer')}
            </p>
          </div>
        ) : (
          questions.map((q) => (
            <div
              key={q.id}
              className="bg-white/5 border border-white/10 p-3 rounded-2xl flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <img
                  src={q.avatar || initialsAvatarUrl(q.username)}
                  alt={q.username}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span className="text-xs font-bold text-white/70">
                  {q.username}
                </span>
              </div>
              <p className="text-sm text-white font-medium">{q.question}</p>

              {isHost && onHighlightQuestion && (
                <div className="flex justify-end gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => onHighlightQuestion(q)}
                    className="min-h-11 text-xs font-bold text-brand-primary-text bg-brand-primary/10 px-4 rounded-full hover:bg-brand-primary/20 transition-colors"
                  >
                    {t('live.qna.project')}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </LiveSheet>
  );
}
