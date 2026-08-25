import { HelpCircle, Send, X } from 'lucide-react';
import { useState } from 'react';

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
}

export default function LiveQnAPanel({
  isOpen,
  onClose,
  isHost,
  questions,
  onAskQuestion,
  onHighlightQuestion,
  onClearHighlight,
}: LiveQnAPanelProps) {
  const [input, setInput] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !onAskQuestion) return;
    onAskQuestion(input);
    setInput('');
  };

  return (
    <div className="absolute inset-x-0 bottom-0 top-[20%] bg-black/90 backdrop-blur-2xl rounded-t-3xl border-t border-white/10 flex flex-col z-50 animate-in slide-in-from-bottom-8 duration-300">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2 text-white">
          <HelpCircle size={20} className="text-pink-400" />
          <h3 className="font-bold">Q&A</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {questions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/50 text-sm text-center">
            <HelpCircle size={40} className="mb-2 opacity-50" />
            <p>
              {isHost
                ? 'No hay preguntas todavía.'
                : 'Haz la primera pregunta.'}
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
                  src={
                    q.avatar ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50'
                  }
                  alt={q.username}
                  className="w-6 h-6 rounded-full object-cover"
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
                    className="text-[11px] font-bold text-pink-400 bg-pink-400/10 px-3 py-1 rounded-full hover:bg-pink-400/20 transition-colors"
                  >
                    Proyectar
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {isHost ? (
        <div className="p-4 border-t border-white/10 bg-black">
          <button
            type="button"
            onClick={onClearHighlight}
            className="w-full py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition-colors"
          >
            Quitar pregunta de pantalla
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-white/10 bg-black flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu pregunta..."
            className="flex-1 bg-white/10 border border-white/10 rounded-full px-4 py-2 text-sm text-white outline-none focus:border-pink-500"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-2 bg-pink-500 rounded-full text-white disabled:opacity-50 hover:bg-pink-600 transition-colors shrink-0"
          >
            <Send size={18} />
          </button>
        </form>
      )}
    </div>
  );
}
