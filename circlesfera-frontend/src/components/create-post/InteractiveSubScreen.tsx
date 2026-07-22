import { BarChart2, HelpCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type InteractiveDraft =
  | { kind: 'poll'; question: string; options: [string, string] }
  | { kind: 'qna'; prompt: string }
  | null;

interface InteractiveSubScreenProps {
  value: InteractiveDraft;
  onChange: (value: InteractiveDraft) => void;
  onClose: () => void;
}

export default function InteractiveSubScreen({
  value,
  onChange,
  onClose,
}: InteractiveSubScreenProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<'none' | 'poll' | 'qna'>(
    value?.kind || 'none',
  );
  const [question, setQuestion] = useState(
    value?.kind === 'poll' ? value.question : '',
  );
  const [option1, setOption1] = useState(
    value?.kind === 'poll' ? value.options[0] : 'Yes',
  );
  const [option2, setOption2] = useState(
    value?.kind === 'poll' ? value.options[1] : 'No',
  );
  const [prompt, setPrompt] = useState(
    value?.kind === 'qna' ? value.prompt : '',
  );

  const save = () => {
    if (kind === 'poll') {
      if (!question.trim() || !option1.trim() || !option2.trim()) return;
      onChange({
        kind: 'poll',
        question: question.trim(),
        options: [option1.trim(), option2.trim()],
      });
    } else if (kind === 'qna') {
      if (!prompt.trim()) return;
      onChange({ kind: 'qna', prompt: prompt.trim() });
    } else {
      onChange(null);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-white/10 w-full max-w-md rounded-lg overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-gray-300"
            aria-label="Go back"
          >
            ←
          </button>
          <h2 className="font-bold text-lg">
            {t('createPost.interactive.title', 'Interactive')}
          </h2>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'none', label: t('createPost.interactive.none', 'None') },
                {
                  id: 'poll',
                  label: t('createPost.interactive.poll', 'Poll'),
                  icon: BarChart2,
                },
                {
                  id: 'qna',
                  label: t('createPost.interactive.qna', 'Q&A'),
                  icon: HelpCircle,
                },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setKind(item.id)}
                className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
                  kind === item.id
                    ? 'bg-brand-primary/20 border-brand-primary/40 text-white'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {kind === 'poll' && (
            <div className="space-y-3">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t(
                  'createPost.interactive.poll_question',
                  'Ask a question…',
                )}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
              <input
                value={option1}
                onChange={(e) => setOption1(e.target.value)}
                placeholder={t('createPost.interactive.option_a', 'Option A')}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
              <input
                value={option2}
                onChange={(e) => setOption2(e.target.value)}
                placeholder={t('createPost.interactive.option_b', 'Option B')}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          )}

          {kind === 'qna' && (
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t(
                'createPost.interactive.qna_prompt',
                'Ask me anything…',
              )}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          )}

          <button
            type="button"
            onClick={save}
            className="w-full py-2.5 rounded-lg bg-brand-primary text-white font-bold text-sm uppercase tracking-wide hover:opacity-90"
          >
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
