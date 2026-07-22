import { HelpCircle, Loader2, Send } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { apiClient } from '../../services/api';
import { logger } from '../../utils/logger';

export const QnaWidget: React.FC<{ qnaBoxId: string; prompt?: string }> = ({
  qnaBoxId,
  prompt = 'Hazme una pregunta...',
}) => {
  const [answerText, setAnswerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

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
    <div className="p-4 bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border border-purple-500/20 rounded-2xl space-y-3 shadow-lg">
      <div className="flex items-center space-x-2 text-purple-400">
        <HelpCircle className="w-4 h-4" />
        <h4 className="text-xs font-bold uppercase tracking-wider">
          Preguntas & Respuestas
        </h4>
      </div>

      <p className="text-sm font-bold text-white tracking-tight">{prompt}</p>

      {sent ? (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-semibold text-center">
          ¡Respuesta enviada al creador!
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-center space-x-2">
          <input
            type="text"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Escribe tu respuesta..."
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
